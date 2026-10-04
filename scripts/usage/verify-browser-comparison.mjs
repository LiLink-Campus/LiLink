import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Failure boundaries: incomplete, failed and unavailable Web response bodies
// must retain observed lower bounds while propagating UNKNOWN into the budget.
// Browser-cache hits, 304 bodies and direct-API traffic are not missing Web bytes.
// Twenty matched arbitrary cells do not prove the required public route matrix.
// A single-cell regression must fail even below the other cells' maximum.
// Missing transfer/image bodies and invalid measurements must not pass a gate.
// The optional homepage matrix has eight exact cells and identical boundaries.
// HTTP output growth is diagnostic; complete independently rounded route files
// own the ISR proxy. Missing/corrupt/mismatched files cannot yield PASS.
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'artifacts/usage/browser-comparison-verification');
await mkdir(output, { recursive: true });
const row = { path: '/fixture.json', category: 'web-api', completion: 'finished', wireStatus: 200,
  partialEncodedDataBytes: 0, fromDiskCache: false, fromMemoryCache: false, fromServiceWorker: false };
const evidence = variant => ({ variant, runId: 'synthetic-cli-fixture', browser: 'synthetic-ledger', publicMatrix: true,
  buildId: `fixture-${variant}`,
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
  { name: 'one-cell-request-regression', unknown: false, gate: 'FAIL', mutate: sample => { sample.webNetworkRequestCount += 1; } },
  { name: 'one-cell-transfer-regression', unknown: false, gate: 'FAIL', expectedTransfer: 1501, mutate: sample => { sample.webBodyGzipEstimate += 1; } },
  { name: 'one-cell-image-read-regression', unknown: false, gate: 'FAIL', mutate: sample => { sample.estimatedImageReadUnits += 1; } },
  { name: 'missing-image-body', unknown: false, gate: 'UNKNOWN', mutate: sample => { sample.imageBodiesMissing = ['/image.webp']; } },
  { name: 'http-output-growth-is-diagnostic', unknown: false, mutate: () => {}, mutatePair: (_, after) => {
    after.cacheOutputs[0].decodedBytes += 1; after.cacheOutputs[0].gzipBytes += 1;
  } },
  { name: 'isr-output-unit-growth', unknown: false, gate: 'FAIL', routeSize: (phase, index) => phase === 'after' && index === 0 ? 8193 : 8192, mutate: () => {} },
  { name: 'isr-units-offset-across-files', unknown: false, routeSize: (phase, index) =>
    (phase === 'after' && index === 0) || (phase === 'before' && index === 1) ? 8193 : 8192, mutate: () => {} },
  { name: 'missing-route-output-evidence', unknown: false, gate: 'UNKNOWN', omitRoute: true, mutate: () => {} },
  { name: 'route-output-build-mismatch', unknown: false, gate: 'UNKNOWN', mutate: () => {}, mutateRoute: report => { report.phases.after.buildId = 'other-build'; } },
  { name: 'route-output-missing-companion', unknown: false, gate: 'UNKNOWN', mutate: () => {}, mutateRoute: report => { report.phases.after.files.pop(); } },
  { name: 'route-output-digest-mismatch', unknown: false, gate: 'UNKNOWN', mutate: () => {}, mutateRoute: report => { report.phases.after.files[0].sha256 = '0'.repeat(64); } },
  { name: 'homepage-journey-matrix', unknown: false, mutate: () => {}, mutatePair: (before, after) => {
    for (const evidence of [before, after]) {
      evidence.publicMatrix = false; evidence.homeJourneys = true;
      evidence.journeyBoundaryRevision = 'visible-hero-finite-journeys-v1';
      evidence.samples = ['desktop', 'mobile'].flatMap(viewport =>
        ['cold-home-stay', 'cold-home-leave', 'cold-home-full', 'warm-home-revisit'].map(scenario =>
          ({ ...structuredClone(evidence.samples.find(sample => sample.viewport === viewport)), scenario })));
    }
  } },
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
  const routeReport = { artifactType: 'local-next-prerendered-output-envelope', runId: before.runId, unitBytes: 8192, phases: {} };
  for (const phase of ['before', 'after']) {
    const files = [];
    for (const [index, name] of ['index.html', 'index.rsc', 'index.meta', 'index.segments/_full.segment.rsc',
      'index.segments/_tree.segment.rsc', 'index.segments/__PAGE__.segment.rsc'].entries()) {
      const body = Buffer.alloc(item.routeSize?.(phase, index) ?? 8192, 32);
      const artifact = `raw/${phase}/${name}`;
      await mkdir(path.dirname(path.join(directory, artifact)), { recursive: true });
      await writeFile(path.join(directory, artifact), body);
      files.push({ path: name, artifact, rawBytes: body.length, raw8KiBUnits: Math.ceil(body.length / 8192),
        complete: true, sha256: createHash('sha256').update(body).digest('hex') });
    }
    routeReport.phases[phase] = { buildId: `fixture-${phase}`, files };
  }
  item.mutateRoute?.(routeReport);
  const routePath = path.join(directory, 'route-outputs.json');
  await writeFile(routePath, JSON.stringify(routeReport));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/usage/compare-browser.mjs'),
    beforePath, afterPath, path.join(directory, 'result'), '--check-resource',
    ...(item.omitRoute ? [] : ['--route-outputs', routePath])], { cwd: root, encoding: 'utf8', timeout: 10_000 });
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
    const budget = after.homeJourneys ? null
      : JSON.parse(await readFile(path.join(directory, 'result/same-condition.report.json'), 'utf8'));
    const costs = budget?.results.filter(row => row.phase === 'after' && row.coldBrowserFraction === 1)
      .map(row => row.rows.find(metric => metric.key === 'fastDataTransferBytes')) ?? [];
    observed = { planningTransferBytes: summary.envelopes.after.cold.planningTransferBytes,
      lowerBound: summary.envelopes.after.cold.observedTransferLowerBoundBytes,
      budgetStatuses: costs.map(row => row.status), evidenceComplete: summary.assertions.transferEvidenceComplete,
      resourceGate: summary.resourceGate?.status, cells: summary.cells.length };
    const expectedTransfer = item.expectedTransfer ?? 1500;
    assertionPassed = costs.length > 0 && (item.unknown
      ? observed.planningTransferBytes === null && observed.lowerBound >= 1500
        && costs.every(row => row.status === 'UNKNOWN' && row.projectUsage === null) && !observed.evidenceComplete
      : observed.planningTransferBytes === expectedTransfer && observed.lowerBound === expectedTransfer
        && costs.every(row => row.status === 'PASS') && observed.evidenceComplete);
    assertionPassed &&= observed.resourceGate === (item.gate ?? (item.unknown ? 'UNKNOWN' : 'PASS'));
    if (after.homeJourneys) assertionPassed = observed.resourceGate === 'PASS' && observed.cells === 8
      && summary.sameConditionMonthly === null;
  } catch { /* Preserve the child exit and bounded diagnostics in the report. */ }
  const expectedExit = item.unknown || (item.gate && item.gate !== 'PASS') ? 1 : 0;
  results.push({ name: item.name, passed: result.status === expectedExit && assertionPassed,
    exitCode: result.status, observed, stderr: result.stderr, error: result.error?.message ?? null });
}
const report = { command: 'node scripts/usage/verify-browser-comparison.mjs', runtime: process.version,
  environment: 'Synthetic JSON ledgers and local CLI subprocesses; no browser, database or production usage claims.',
  passed: results.every(result => result.passed), results };
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, cases: results.map(({ name, passed }) => ({ name, passed })),
  artifact: path.join(output, 'report.json') }));
if (!report.passed) process.exitCode = 1;
