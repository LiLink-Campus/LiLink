import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOptions } from './options.mjs';
import { createSampleBrowser } from './sample.mjs';
import { sampleEarlyClick } from './early-click-sample.mjs';
import { summarize } from './summarize.mjs';
import { readDisposableSession, readComparisonSession } from './local-session.mjs';

const config = await readOptions(process.argv.slice(2));
const argument = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--before-session') || !process.argv.includes('--after-session')) {
  throw new Error('This immediate-click extension requires canonical before/after disposable session files.');
}
const { comparison, session: beforeSession } = await readComparisonSession(argument('--before-session'));
const afterSession = await readDisposableSession(argument('--after-session'));
if (beforeSession.runId !== afterSession.runId || config.variants.before.webUrl !== comparison.beforeUrl
  || config.variants.after.webUrl !== afterSession.webUrl) throw new Error('Before and after must use the same isolated session.');
if (config.resume) throw new Error('Early-click evidence requires a new output directory.');
config.routes = [];
await mkdir(config.output, { recursive: true });
const rawPath = path.join(config.output, 'raw.json');
try { await readFile(rawPath); throw new Error('Output already contains raw.json.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const snapshot = path.join(config.output, 'harness-source');
await mkdir(snapshot, { recursive: true });
const files = [];
for (const file of ['early-click.mjs', 'early-click-sample.mjs', 'local-session.mjs', 'browser-observers.mjs', 'first-screen-observer.mjs', 'network.mjs', 'options.mjs', 'sample.mjs', 'summarize.mjs']) {
  const body = await readFile(path.join(sourceRoot, file));
  await writeFile(path.join(snapshot, file), body);
  files.push({ file, sha256: createHash('sha256').update(body).digest('hex') });
}
const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
await writeFile(path.join(snapshot, 'manifest.json'), JSON.stringify({ digest, files }, null, 2));
const raw = { schemaVersion: 3, measurementRevision: `immediate-click-${config.clickReadiness}-native-navigation-v2`,
  startedAt: new Date().toISOString(), harnessDigest: digest, config,
  methodology: `Fresh browser per journey; ${config.clickReadiness === 'preview' ? 'document-start preview-visible milestone without waiting for DCL, fonts or HD' : 'strict source readiness'} then necessary link scroll and trusted click immediately. Native document and client navigation are both valid. No five-second observation or dwell. Only custom click-to-target-ready is compared; no FCP/LCP/INP conclusion.`, samples: [] };
const save = async () => {
  raw.updatedAt = new Date().toISOString();
  await writeFile(`${rawPath}.tmp`, JSON.stringify(raw, null, 2)); await rename(`${rawPath}.tmp`, rawPath);
};

async function saveSummary() {
  const full = summarize(raw);
  // This separate contract compares only click latency; it does not retest menu feedback.
  full.cells = full.cells.filter(cell => cell.metric === 'clickToContentReadyMs');
  full.status = full.cells.some(cell => cell.status === 'FAIL') ? 'FAIL'
    : full.complete && full.cells.length && full.cells.every(cell => cell.status === 'PASS') ? 'PASS' : 'INCONCLUSIVE';
  if ((raw.fatalError || raw.interrupted) && full.status === 'PASS') full.status = 'INCONCLUSIVE';
  full.measurementRevision = raw.measurementRevision;
  full.sourceReadyToClickMs = Object.fromEntries(['before', 'after'].map(variant => {
    const values = raw.samples.filter(value => value.variant === variant && Number.isFinite(value.sourceReadyToClickMs))
      .map(value => value.sourceReadyToClickMs).sort((a, b) => a - b);
    return [variant, { count: values.length, min: values[0] ?? null, max: values.at(-1) ?? null,
      median: !values.length ? null : values.length % 2 ? values[Math.floor(values.length / 2)]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2 }];
  }));
  await writeFile(path.join(config.output, 'summary.json'), JSON.stringify(full, null, 2));
  const lines = ['# Immediate click comparison', '', `Status: **${full.status}**. Samples: ${full.actualSamples}/${full.plannedSamples}.`, '',
    raw.methodology, '', full.interpretation, '', '| Scenario | Pairs | Before median / p75 (ms) | After median / p75 (ms) | Median difference CI | p75 difference CI | Result |',
    '| --- | ---: | ---: | ---: | --- | --- | --- |'];
  for (const cell of full.cells) lines.push(`| ${cell.cell} | ${cell.pairs} | ${cell.before.median} / ${cell.before.p75} | ${cell.after.median} / ${cell.after.p75} | ${cell.ci95MedianDifference.join(' … ')} | ${cell.ci95P75Difference.join(' … ')} | ${cell.status} |`);
  lines.push('', `Source-ready to trusted-click interval: ${JSON.stringify(full.sourceReadyToClickMs)}. This includes necessary scroll and locator action overhead; no artificial dwell is added.`);
  await writeFile(path.join(config.output, 'summary.md'), `${lines.join('\n')}\n`);
  return full;
}

let active;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; void active?.browser.close(); });
try {
  outer: for (let round = 1; round <= config.rounds; round++) {
    const order = round % 2 ? ['before', 'after'] : ['after', 'before'];
    for (const viewport of config.viewports) for (const target of ['/about', '/register']) for (const variant of order) {
      if (interrupted) break outer;
      const definition = config.variants[variant];
      if (definition.expiresAt && Date.parse(definition.expiresAt) < Date.now()) throw new Error('Runner session expired.');
      active = await createSampleBrowser(config, definition, viewport);
      try {
        const result = await sampleEarlyClick(active, config, { round, variant, viewport,
          scenario: `immediate-${config.clickReadiness}-home-${target.slice(1)}`, order: order.join('-') }, target);
        raw.samples.push(result); await save();
        console.log(JSON.stringify({ round, variant, viewport, target, metrics: result.metrics,
          sourceReadyToClickMs: result.sourceReadyToClickMs, failures: result.failures, samples: raw.samples.length }));
      } finally { await active.browser.close(); active = null; }
    }
    await saveSummary();
  }
} catch (error) { raw.fatalError = error.message.split('\n')[0]; }
finally {
  await active?.browser.close(); raw.interrupted = interrupted; raw.finishedAt = new Date().toISOString(); await save();
}
const summary = await saveSummary();
console.log(JSON.stringify({ output: config.output, status: summary.status, samples: raw.samples.length, harnessDigest: digest }));
process.exitCode = summary.status === 'PASS' ? 0 : summary.status === 'FAIL' ? 1 : 2;
