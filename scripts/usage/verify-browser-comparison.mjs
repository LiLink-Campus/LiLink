import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Failure boundaries: incomplete, failed and unavailable Web response bodies
// must retain observed lower bounds while propagating UNKNOWN into the budget.
// Browser-cache hits, 304 bodies and direct-API traffic are not missing Web bytes.
// Twenty matched arbitrary cells do not prove the required public route matrix.
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'artifacts/usage/browser-comparison-verification');
await mkdir(output, { recursive: true });
const row = { path: '/fixture.json', category: 'web-api', completion: 'finished', wireStatus: 200,
  partialEncodedDataBytes: 0, fromDiskCache: false, fromMemoryCache: false, fromServiceWorker: false };
const evidence = variant => ({ variant, runId: 'synthetic-cli-fixture', browser: 'synthetic-ledger', publicMatrix: true,
  samples: ['desktop', 'mobile'].flatMap(viewport => ['home', 'about', 'schools', 'register', 'register-school']
    .flatMap(route => ['cold', 'warm'].map(cache => ({ viewport, scenario: `${cache}-${route}`,
      size: viewport === 'desktop' ? { width: 1280, height: 800 } : { width: 393, height: 851 },
      webNetworkRequestCount: 2, optimizedImageNetworkRequestCount: 0, estimatedImageReadUnits: 0,
      webBodyGzipEstimate: 1200, estimatedWebRequestHeaderBytes: 200, webResponseHeaderBytes: 100,
      incompleteResources: [], imageBodiesMissing: [], resources: [structuredClone(row)] })))),
  cacheOutputs: ['html', 'rsc'].map(kind => ({ kind, status: 200, decodedBytes: 8192, gzipBytes: 2048 })),
  pwa: { note: 'Synthetic CLI fixture only; no browser installation is claimed.' } });
const cases = [
  { name: 'complete-body', unknown: false, mutate: () => {} },
  { name: 'pending-body', unknown: true, mutate: sample => { sample.resources[0].completion = 'incomplete'; sample.resources[0].partialEncodedDataBytes = 45; } },
  { name: 'failed-body', unknown: true, mutate: sample => { sample.resources[0].completion = 'failed'; sample.resources[0].failure = 'net::ERR_FAILED'; } },
  { name: 'unavailable-body', unknown: true, mutate: sample => { sample.resources[0].bodyUnavailable = true; } },
  { name: 'late-completion-keeps-incomplete-snapshot', unknown: true, mutate: sample => { sample.incompleteResources = ['/fixture.json']; } },
  { name: '304-has-no-body', unknown: false, mutate: sample => { sample.resources[0].wireStatus = 304; sample.resources[0].bodyUnavailable = true; } },
  { name: 'memory-cache-has-no-network-body', unknown: false, mutate: sample => { sample.resources[0].fromMemoryCache = true; sample.resources[0].bodyUnavailable = true; } },
  { name: 'direct-api-not-web-transfer', unknown: false, mutate: sample => { sample.resources[0].category = 'direct-api'; sample.resources[0].completion = 'incomplete'; sample.resources[0].partialEncodedDataBytes = 9000; } },
  { name: 'missing-required-route-cell', reject: true, mutate: () => {}, mutatePair: (before, after) => {
    before.samples[0].scenario = 'cold-invented-route'; after.samples[0].scenario = 'cold-invented-route';
  } },
];
const results = [];
for (const item of cases) {
  const directory = path.join(output, item.name);
  await mkdir(directory, { recursive: true });
  const before = evidence('before'); const after = evidence('after');
  item.mutate(after.samples[0]);
  item.mutatePair?.(before, after);
  const beforePath = path.join(directory, 'before.json'); const afterPath = path.join(directory, 'after.json');
  await writeFile(beforePath, JSON.stringify(before)); await writeFile(afterPath, JSON.stringify(after));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/usage/compare-browser.mjs'),
    beforePath, afterPath, path.join(directory, 'result')], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  let assertionPassed = false;
  let observed;
  if (item.reject) {
    results.push({ name: item.name, passed: result.status !== 0 && result.status !== null
      && /20 required route\/viewport\/cold-warm cells/.test(result.stderr), exitCode: result.status,
      stderr: result.stderr, error: result.error?.message ?? null });
    continue;
  }
  try {
    const summary = JSON.parse(await readFile(path.join(directory, 'result/summary.json'), 'utf8'));
    const budget = JSON.parse(await readFile(path.join(directory, 'result/same-condition.report.json'), 'utf8'));
    const costs = budget.results.filter(row => row.phase === 'after' && row.coldBrowserFraction === 1)
      .map(row => row.rows.find(metric => metric.key === 'fastDataTransferBytes'));
    observed = { planningTransferBytes: summary.envelopes.after.cold.planningTransferBytes,
      lowerBound: summary.envelopes.after.cold.observedTransferLowerBoundBytes,
      budgetStatuses: costs.map(row => row.status), evidenceComplete: summary.assertions.transferEvidenceComplete };
    assertionPassed = costs.length > 0 && (item.unknown
      ? observed.planningTransferBytes === null && observed.lowerBound >= 1500
        && costs.every(row => row.status === 'UNKNOWN' && row.projectUsage === null) && !observed.evidenceComplete
      : observed.planningTransferBytes === 1500 && observed.lowerBound === 1500
        && costs.every(row => row.status === 'PASS') && observed.evidenceComplete);
  } catch { /* Preserve the child exit and bounded diagnostics in the report. */ }
  results.push({ name: item.name, passed: result.status === 0 && assertionPassed,
    exitCode: result.status, observed, stderr: result.stderr, error: result.error?.message ?? null });
}
const report = { command: 'node scripts/usage/verify-browser-comparison.mjs', runtime: process.version,
  environment: 'Synthetic JSON ledgers and local CLI subprocesses; no browser, database or production usage claims.',
  passed: results.every(result => result.passed), results };
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, cases: results.map(({ name, passed }) => ({ name, passed })),
  artifact: path.join(output, 'report.json') }));
if (!report.passed) process.exitCode = 1;
