import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

export const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type FileEvidence = {
  path: string; kind: 'route' | 'data'; bytes: number; gzipBytes: number;
  raw8KiBUnits: number; gzip8KiBUnits: number; sha256: string; mtimeNs: string;
  artifact: string; complete: boolean; tags?: string[]; revalidate?: number;
};
type Version = FileEvidence & { phase: string; observedAt: string; elapsedMs: number };

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}

// Disk evidence observes the local Next adapter. A file mtime or fs.watch event is
// not a Vercel billable write; rapid writes may coalesce between observations.
export class IsrWriteEvidence {
  readonly versions: Version[] = [];
  readonly boundaries: Array<{ phase: string; at: string; files: FileEvidence[] }> = [];
  readonly errors: string[] = [];
  readonly nextRoot = path.join(process.env.E2E_WORKSPACE!, 'apps/web/.next');
  private readonly latest = new Map<string, FileEvidence>();
  private readonly startedAt = Date.now();
  private phase = 'setup';
  private pending: Promise<void> = Promise.resolve();
  private scanning = false;
  private timer?: ReturnType<typeof setInterval>;
  private watchers: FSWatcher[] = [];
  private lastChange = Date.now();

  constructor(readonly output: string) {}

  async start() {
    await mkdir(path.join(this.output, 'files'), { recursive: true });
    await this.scan();
    for (const directory of ['server/app', 'cache/fetch-cache']) {
      this.watchers.push(watch(path.join(this.nextRoot, directory), { recursive: true }, () => this.queue()));
    }
    this.timer = setInterval(() => this.queue(), 20);
  }

  private queue() {
    if (this.scanning) return this.pending;
    this.scanning = true;
    this.pending = this.scan().catch(error => { this.errors.push(String(error.message)); })
      .finally(() => { this.scanning = false; });
    return this.pending;
  }

  async flush() { await this.queue(); }

  async mark(phase: string) {
    await this.flush();
    this.phase = phase;
    const snapshot = [...this.latest.values()].sort((a, b) => a.path.localeCompare(b.path));
    this.boundaries.push({ phase, at: new Date().toISOString(), files: snapshot });
    return snapshot;
  }

  async quiet(durationMs = 1000, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    do {
      await sleep(50); await this.flush();
      if (Date.now() - this.lastChange >= durationMs) return;
    } while (Date.now() < deadline);
    throw new Error('Tracked cache files did not become quiet.');
  }

  private async scan() {
    const appRoot = path.join(this.nextRoot, 'server/app');
    const candidates = (await files(appRoot)).filter(file => /^index\.(html|rsc|meta)$/.test(path.relative(appRoot, file))
      || path.relative(appRoot, file).startsWith('index.segments/'));
    candidates.push(...await files(path.join(this.nextRoot, 'cache/fetch-cache')));
    for (const file of candidates) {
      const relative = path.relative(this.nextRoot, file).split(path.sep).join('/');
      let before, body, after;
      try {
        before = await stat(file, { bigint: true }); body = await readFile(file);
        after = await stat(file, { bigint: true });
      } catch (error: any) { if (error.code === 'ENOENT') continue; throw error; }
      if (before.mtimeNs !== after.mtimeNs || before.size !== after.size || BigInt(body.length) !== after.size) continue;
      const kind = relative.startsWith('cache/') ? 'data' : 'route';
      let tags: string[] | undefined, revalidate: number | undefined;
      if (kind === 'data') {
        let data; try { data = JSON.parse(body.toString()); } catch { continue; }
        tags = data.tags;
        if (!tags?.includes('public-home')) continue;
        revalidate = data.revalidate;
      }
      const digest = sha256(body);
      const previous = this.latest.get(relative);
      if (previous?.mtimeNs === after.mtimeNs.toString() && previous.sha256 === digest) continue;
      const gzipBytes = gzipSync(body).length;
      const artifact = `files/${digest}-${path.basename(file)}`;
      await writeFile(path.join(this.output, artifact), body);
      const item: FileEvidence = { path: relative, kind, bytes: body.length, gzipBytes,
        raw8KiBUnits: Math.ceil(body.length / 8192), gzip8KiBUnits: Math.ceil(gzipBytes / 8192),
        sha256: digest, mtimeNs: after.mtimeNs.toString(), artifact,
        complete: !relative.endsWith('.html') || body.toString().includes('</html>'), tags, revalidate };
      this.latest.set(relative, item);
      this.lastChange = Date.now();
      this.versions.push({ ...item, phase: this.phase, observedAt: new Date().toISOString(), elapsedMs: Date.now() - this.startedAt });
    }
  }

  async stop() {
    clearInterval(this.timer);
    for (const watcher of this.watchers) watcher.close();
    await this.flush();
  }

  async manifestSummary() {
    const manifest = JSON.parse(await readFile(path.join(this.nextRoot, 'prerender-manifest.json'), 'utf8'));
    const routes = Object.entries(manifest.routes).map(([route, value]) => {
      const row = value as Record<string, unknown>;
      return { route, initialRevalidateSeconds: row.initialRevalidateSeconds, initialExpireSeconds: row.initialExpireSeconds,
        dataRoute: row.dataRoute, srcRoute: row.srcRoute };
    });
    const inventory = [];
    for (const file of await files(path.join(this.nextRoot, 'server/app'))) {
      if (!/\.(html|rsc|meta|body|segment\.rsc)$/.test(file)) continue;
      const bytes = await readFile(file);
      inventory.push({ path: path.relative(this.nextRoot, file), bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: sha256(bytes) });
    }
    return { manifestVersion: manifest.version, routes, inventory };
  }

  async summarize() {
    const phases = [...new Set(this.boundaries.map(row => row.phase))];
    const phaseSummaries = [];
    for (const phase of phases) {
      const versions = this.versions.filter(row => row.phase === phase);
      const html = versions.filter(row => row.path === 'server/app/index.html' && row.complete);
      const prior = this.boundaries.find(row => row.phase === phase)?.files.find(row => row.path === 'server/app/index.html');
      let lastHash = prior?.sha256;
      const sequence = [];
      for (const row of html) {
        const previous = this.versions.find(v => v.path === row.path && v.sha256 === lastHash);
        let difference = null;
        if (previous && previous.sha256 !== row.sha256) {
          const a = await readFile(path.join(this.output, previous.artifact), 'utf8');
          const b = await readFile(path.join(this.output, row.artifact), 'utf8');
          let offset = 0; while (offset < Math.min(a.length, b.length) && a[offset] === b[offset]) offset++;
          const normalizeTrace = (text: string) => text.replace(/(<meta name="(?:sentry-trace|baggage)" content=")[^"]*(")/g, '$1[redacted]$2');
          difference = { firstDifferentCharacter: offset, lengthBefore: a.length, lengthAfter: b.length,
            containsSentryTraceMetaBefore: /name="(?:sentry-trace|baggage)"/.test(a),
            containsSentryTraceMetaAfter: /name="(?:sentry-trace|baggage)"/.test(b),
            identicalAfterTraceMetaNormalization: normalizeTrace(a) === normalizeTrace(b),
            changedNearTraceField: /sentry-trace|baggage/.test(a.slice(Math.max(0, offset - 160), offset + 160) + b.slice(Math.max(0, offset - 160), offset + 160)) };
        }
        sequence.push({ elapsedMs: row.elapsedMs, sha256: row.sha256, mtimeNs: row.mtimeNs,
          contentChanged: lastHash !== row.sha256, bytes: row.bytes, gzipBytes: row.gzipBytes, difference });
        lastHash = row.sha256;
      }
      phaseSummaries.push({ phase, observedHtmlFileVersions: html.length,
        observedDataFileVersions: versions.filter(row => row.kind === 'data').length,
        observedAllFileVersions: versions.length, htmlSequence: sequence });
    }
    return { phaseSummaries, versions: this.versions, boundaries: this.boundaries, observationErrors: this.errors,
      limitations: ['Local filesystem adapter observations, not Vercel billing.',
        '20 ms sampling plus fs.watch may coalesce rapid writes; observed file versions are a lower bound, not an exact invocation counter.',
        'HTML/RSC/meta/segments belong to one route generation; do not count every file as one ISR regeneration.',
        'Raw and gzip byte units are alternative size observations; production accounting compression is not established.',
        'Existing isolated runner uses empty Sentry DSNs; unchanged local bytes do not establish unchanged production trace output.'] };
  }
}
