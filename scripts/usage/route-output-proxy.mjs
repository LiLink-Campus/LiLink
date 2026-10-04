import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const homepageFile = name => ['index.html', 'index.meta', 'index.rsc'].includes(name) || name.startsWith('index.segments/');
const companions = ['index.html', 'index.meta', 'index.rsc', 'index.segments/_full.segment.rsc',
  'index.segments/_tree.segment.rsc', 'index.segments/__PAGE__.segment.rsc'];
const sum = files => ({ files: files.length, rawBytes: files.reduce((total, file) => total + file.rawBytes, 0),
  independentlyRounded8KiBUnits: files.reduce((total, file) => total + Math.ceil(file.rawBytes / 8192), 0) });

export async function readRouteOutputProxy(source, before, after) {
  const base = { source: source ?? null, productionBilling: false,
    policy: 'Complete homepage files rounded independently by 8 KiB, then summed; raw and gzip HTTP bytes are diagnostic.' };
  if (!source) return { ...base, status: 'UNKNOWN', reason: 'A matching complete route-output capture was not supplied.' };
  try {
    const report = JSON.parse(await readFile(source, 'utf8'));
    if (report.artifactType !== 'local-next-prerendered-output-envelope' || report.runId !== before.runId
      || report.unitBytes !== 8192) throw new Error('Route-output capture identity or unit size does not match.');
    const root = await realpath(path.dirname(path.resolve(source)));
    const phases = {};
    for (const [phase, browserCapture] of [['before', before], ['after', after]]) {
      const captured = report.phases?.[phase];
      if (!browserCapture.buildId || captured?.buildId !== browserCapture.buildId) {
        throw new Error(`${phase}: browser and route-output build IDs must be present and match.`);
      }
      if (!Array.isArray(captured.files) || !captured.files.length) throw new Error(`${phase}: route-file evidence is missing.`);
      const seen = new Set();
      for (const file of captured.files) {
        if (typeof file.path !== 'string' || !file.path || path.isAbsolute(file.path)
          || file.path.split('/').some(part => !part || part === '.' || part === '..') || file.path.includes('\\')
          || seen.has(file.path) || file.artifact !== `raw/${phase}/${file.path}` || file.complete !== true
          || !Number.isSafeInteger(file.rawBytes) || file.rawBytes <= 0
          || file.raw8KiBUnits !== Math.ceil(file.rawBytes / 8192) || !/^[a-f0-9]{64}$/.test(file.sha256)) {
          throw new Error(`${phase}: incomplete, duplicate or inconsistent route-file ledger.`);
        }
        seen.add(file.path);
        const target = path.join(root, file.artifact);
        if (await realpath(target) !== target || !(await lstat(target)).isFile()) {
          throw new Error(`${phase}: raw evidence must be regular files without symlinks.`);
        }
        const body = await readFile(target);
        if (body.length !== file.rawBytes || createHash('sha256').update(body).digest('hex') !== file.sha256) {
          throw new Error(`${phase}: retained route-file size or SHA-256 does not match.`);
        }
      }
      if (companions.some(name => !seen.has(name))) throw new Error(`${phase}: homepage companion files are missing.`);
      phases[phase] = { buildId: captured.buildId, homepage: sum(captured.files.filter(file => homepageFile(file.path))),
        allOutputsDiagnostic: sum(captured.files) };
    }
    const left = phases.before.homepage.independentlyRounded8KiBUnits;
    const right = phases.after.homepage.independentlyRounded8KiBUnits;
    return { ...base, status: right <= left ? 'PASS' : 'FAIL', phases,
      homepageUnitChange: right - left,
      note: 'Whole-build totals are deployment-size diagnostics; this gate does not prove Vercel object completeness, regeneration frequency or bills.' };
  } catch (error) {
    return { ...base, status: 'UNKNOWN', reason: error.code ? `Route-output evidence unavailable (${error.code}).` : error.message };
  }
}
