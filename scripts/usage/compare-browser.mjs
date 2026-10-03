import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateBudget } from './budget.mjs';

const [beforePath, afterPath, output, modelPath = 'scripts/usage/hobby-50000pv.scenario.json'] = process.argv.slice(2);
if (!beforePath || !afterPath || !output) throw new Error('Usage: node scripts/usage/compare-browser.mjs <before.json> <after.json> <output-directory> [source-model.json]');
const before = JSON.parse(await readFile(beforePath, 'utf8'));
const after = JSON.parse(await readFile(afterPath, 'utf8'));
if (before.variant !== 'before' || after.variant !== 'after' || before.runId !== after.runId
  || before.browser !== after.browser || !before.publicMatrix || !after.publicMatrix) {
  throw new Error('Comparison requires the same disposable session, Chromium version and full-document matrix.');
}
const cellKey = sample => `${sample.viewport}/${sample.scenario}`;
const map = evidence => new Map(evidence.samples.map(sample => [cellKey(sample), sample]));
const left = map(before); const right = map(after);
const requiredCells = ['desktop', 'mobile'].flatMap(viewport => ['home', 'about', 'schools', 'register', 'register-school']
  .flatMap(route => ['cold', 'warm'].map(kind => `${viewport}/${kind}-${route}`)));
if (before.samples.length !== requiredCells.length || after.samples.length !== requiredCells.length
  || requiredCells.some(key => !left.has(key) || !right.has(key))) {
  throw new Error('Both sides must contain all 20 required route/viewport/cold-warm cells exactly once.');
}
const delta = (a, b) => ({ before: a, after: b, change: a === null || b === null ? null : b - a,
  reductionPercent: a === null || b === null || a === 0 ? null : (a - b) / a * 100 });
const observedTransfer = sample => sample.webBodyGzipEstimate + sample.estimatedWebRequestHeaderBytes
  + sample.webResponseHeaderBytes + sample.resources.filter(row => row.completion === 'incomplete')
    .filter(row => !['direct-api', 'external', 'static-cdn'].includes(row.category)
      && !row.fromDiskCache && !row.fromMemoryCache && !row.fromServiceWorker)
    .reduce((sum, row) => sum + row.partialEncodedDataBytes, 0);
const missingTransfer = sample => [...new Set([...sample.incompleteResources, ...sample.resources.filter(row =>
  !['direct-api', 'external', 'static-cdn'].includes(row.category)
  && !row.fromDiskCache && !row.fromMemoryCache && !row.fromServiceWorker
  && (row.completion === 'incomplete' || row.completion === 'failed'
    || (row.wireStatus !== 304 && row.bodyUnavailable))).map(row => row.path)])];
const transfer = sample => missingTransfer(sample).length ? null : observedTransfer(sample);
const cells = [...left].map(([key, a]) => {
  const b = right.get(key);
  if (JSON.stringify(a.size) !== JSON.stringify(b.size)) throw new Error(`Viewport mismatch: ${key}`);
  return { key, viewport: a.viewport, scenario: a.scenario,
    networkRequests: delta(a.webNetworkRequestCount, b.webNetworkRequestCount),
    optimizedImageRequests: delta(a.optimizedImageNetworkRequestCount, b.optimizedImageNetworkRequestCount),
    estimatedImageReadUnits: delta(a.estimatedImageReadUnits, b.estimatedImageReadUnits),
    planningTransferBytes: delta(transfer(a), transfer(b)),
    observedTransferLowerBoundBytes: delta(observedTransfer(a), observedTransfer(b)),
    missingTransfer: { before: missingTransfer(a), after: missingTransfer(b) },
    incomplete: { before: a.incompleteResources, after: b.incompleteResources },
    imageBodiesMissing: { before: a.imageBodiesMissing, after: b.imageBodiesMissing },
    failures: { before: a.resources.filter(row => row.failure).map(row => ({ path: row.path, failure: row.failure })),
      after: b.resources.filter(row => row.failure).map(row => ({ path: row.path, failure: row.failure })) },
  };
});
const envelope = evidence => Object.fromEntries(['cold', 'warm'].map(kind => {
  const samples = evidence.samples.filter(sample => sample.scenario.startsWith(`${kind}-`));
  return [kind, { networkRequests: Math.max(...samples.map(sample => sample.webNetworkRequestCount)),
    optimizedImageRequests: Math.max(...samples.map(sample => sample.optimizedImageNetworkRequestCount)),
    estimatedImageReadUnits: samples.some(sample => sample.imageBodiesMissing.length) ? null
      : Math.max(...samples.map(sample => sample.estimatedImageReadUnits)),
    planningTransferBytes: samples.some(sample => missingTransfer(sample).length) ? null : Math.max(...samples.map(transfer)),
    observedTransferLowerBoundBytes: Math.max(...samples.map(observedTransfer)),
    missingTransferResources: samples.flatMap(sample => missingTransfer(sample).map(resource => `${cellKey(sample)}:${resource}`)),
    incompleteResources: samples.flatMap(sample => sample.incompleteResources.map(resource => `${cellKey(sample)}:${resource}`)),
  }];
}));
const envelopes = { before: envelope(before), after: envelope(after) };
const homeOutputs = ['html', 'rsc'].map(kind => {
  const a = before.cacheOutputs.find(row => row.kind === kind); const b = after.cacheOutputs.find(row => row.kind === kind);
  if (!a || !b || a.status !== 200 || b.status !== 200) throw new Error(`Complete home ${kind} outputs are required.`);
  return { kind, decodedBytes: delta(a.decodedBytes, b.decodedBytes), gzipBytes: delta(a.gzipBytes, b.gzipBytes),
    decoded8KiBUnits: delta(Math.ceil(a.decodedBytes / 8192), Math.ceil(b.decodedBytes / 8192)) };
});
const sourceModel = JSON.parse(await readFile(modelPath, 'utf8'));
const stress = structuredClone(sourceModel);
delete stress.intermediate;
stress.before = structuredClone(sourceModel.after);
stress.after = structuredClone(sourceModel.after);
// Separate observed resource costs from fixed reserves using this frozen input.
const basis = sourceModel.after.publicBrowserEnvelope;
const addOns = {};
for (const kind of ['cold', 'warm']) {
  for (const [field, metric, suffix] of [['networkRequests', 'cdnRequests', 'Requests'],
    ['planningTransferBytes', 'fastDataTransferBytes', 'TransferBytes']]) {
    const observed = basis?.[kind]?.[field];
    const total = sourceModel.after[`${kind}PerPageView`][metric];
    if (!Number.isFinite(observed) || observed < 0 || !Number.isFinite(total) || total < observed) {
      throw new Error(`An explicit nonnegative after.publicBrowserEnvelope.${kind}.${field} and fixed reserve are required; use an annotated frozen model.`);
    }
    addOns[`${kind}${suffix}`] = total - observed;
  }
}
for (const phase of ['before', 'after']) {
  stress[phase].status = 'same-session-resource-optimization-pressure-comparison-not-production';
  for (const kind of ['cold', 'warm']) {
    const costs = stress[phase][`${kind}PerPageView`]; const observed = envelopes[phase][kind];
    costs.cdnRequests = observed.networkRequests + addOns[`${kind}Requests`];
    costs.fastDataTransferBytes = observed.planningTransferBytes === null ? null
      : observed.planningTransferBytes + addOns[`${kind}TransferBytes`];
    costs.imageReads = observed.estimatedImageReadUnits;
  }
  stress[phase].publicBrowserEnvelope = envelopes[phase];
}
stress.notes.push('This comparison changes only observed public browser requests/bytes/optimizer-read envelope. The 50K PV, uncertainty, PWA-per-PV stress reserves, Sentry, callbacks, unknown team/storage/compute/image-write allowances and ISR policy/22-unit route-file model remain unchanged. HTML/RSC byte differences are separately disclosed and must be checked against full regenerated route files before claiming unchanged ISR Writes.');
stress.evidence.browser.source = `${beforePath};${afterPath}; same disposable run ${after.runId}`;
stress.evidence.images.source = 'Only observed network optimizer response bytes are remeasured; actual Vercel misses, transformations, writes and production private/dynamic images remain unknown.';
const stressReport = calculateBudget(stress);
const calibrated = structuredClone(stress);
for (const phase of ['before', 'after']) {
  calibrated[phase].coldPerPageView.cdnRequests -= 5;
  calibrated[phase].warmPerPageView.cdnRequests -= 1;
  if (calibrated[phase].coldPerPageView.fastDataTransferBytes !== null) calibrated[phase].coldPerPageView.fastDataTransferBytes -= 20480;
  if (calibrated[phase].warmPerPageView.fastDataTransferBytes !== null) calibrated[phase].warmPerPageView.fastDataTransferBytes -= 4096;
  // Session frequency is not inferable from page views or a local browser capture.
  calibrated[phase].monthlyAdditionalUsage.cdnRequests = null;
  calibrated[phase].monthlyAdditionalUsage.fastDataTransferBytes = null;
}
calibrated.pwaSessionCalibration = {
  monthlyInstallations: null, monthlyInstalledRevisits: null, verified: false,
  installationMeaning: 'Browser service-worker first install or version upgrade after automatic production-page registration; not manual app-install clicks. Upgrade costs and actual monthly session counts are unverified.',
  before: before.pwa, after: after.pwa,
  requestFormula: 'Existing monthly reserve + monthlyInstallations * observed installation overhead + monthlyInstalledRevisits * observed revisit overhead; unknown session counts yield UNKNOWN.',
  telemetry: 'Existing Sentry and Analytics/Speed allowances remain assumptions; production counts are unverified and have not been lowered.',
};
calibrated.notes.push('PWA costs are moved from every PV into explicit installation/installed-revisit sessions. Actual monthly counts are unknown; request/transfer forecast is UNKNOWN rather than a fabricated PASS. Route mix is not inferred from Analytics events.');
const calibratedReport = calculateBudget(calibrated);
const monthly = stressReport.results.map(result => ({ phase: result.phase, scenario: result.scenario,
  metrics: result.rows.filter(row => ['cdnRequests', 'fastDataTransferBytes', 'imageReads', 'isrWrites'].includes(row.key))
    .map(({ key, projectUsage, budget, status }) => ({ key, projectUsage, budget, status })) }));
const summary = { schemaVersion: 1, createdAt: new Date().toISOString(), runId: after.runId, browser: after.browser,
  sources: { before: beforePath, after: afterPath, model: modelPath }, addOns, cells, envelopes, homeOutputs, sameConditionMonthly: monthly,
  pwa: { before: before.pwa, after: after.pwa },
  assertions: { completeMatchedMatrix: true, identicalViewports: true, identicalPolicyAndReserves: true,
    optimizedImageBodyEvidenceComplete: cells.every(cell => !cell.imageBodiesMissing.before.length && !cell.imageBodiesMissing.after.length),
    transferEvidenceComplete: cells.every(cell => !cell.missingTransfer.before.length && !cell.missingTransfer.after.length) },
  notes: ['Local outgoing browser requests and 8 KiB optimized-image response envelopes are not Vercel billing measurements.',
    'Observed transfer lower bounds use the local gzip/header planning model, not measured wire bytes. Missing Web response bodies make the planning envelope and transfer budget UNKNOWN; fixed reserves do not prove a bound on unseen tails.',
    'Incomplete devlog/other responses, unknown real PWA sessions, telemetry, private routes and team usage remain explicit.',
    'ISR invalidation/regeneration frequency is unchanged; altered HTML/RSC markup can change stored bytes and deployment writes.'],
};
await mkdir(output, { recursive: true });
for (const [name, data] of [['source-model', sourceModel], ['summary', summary], ['same-condition.scenario', stress], ['same-condition.report', stressReport],
  ['pwa-session-calibrated.scenario', calibrated], ['pwa-session-calibrated.report', calibratedReport]]) {
  await writeFile(path.join(output, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`);
}
const table = cells.map(cell => `| ${cell.key} | ${cell.networkRequests.before} → ${cell.networkRequests.after} | ${cell.estimatedImageReadUnits.before} → ${cell.estimatedImageReadUnits.after} |`);
await writeFile(path.join(output, 'summary.md'), `# Local resource comparison\n\nRun: ${after.runId}; ${after.browser}. These are browser measurements, not Vercel bills.\n\n| Cell | Web network requests | Optimizer-read envelope (8 KiB units) |\n| --- | ---: | ---: |\n${table.join('\n')}\n\nTransfer body evidence: ${summary.assertions.transferEvidenceComplete ? 'complete in this capture' : 'incomplete; affected transfer envelopes and budgets are UNKNOWN'}. Observed gzip/header lower bounds are retained separately and do not bound unseen response tails or establish production wire bytes.\n\nPWA session frequencies, real telemetry, private flows and production cache misses remain unverified. ISR policy is unchanged; output-size evidence is retained separately.\n`);
console.log(JSON.stringify({ output: path.resolve(output), runId: after.runId, envelopes, homeOutputs,
  sameConditionUsagePass: stressReport.usageForecastPass, calibratedUsagePass: calibratedReport.usageForecastPass }, null, 2));
