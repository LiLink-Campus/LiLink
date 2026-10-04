import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
};
const round = value => value === null ? null : Number(value.toFixed(3));
function bootstrap(pairs, q) {
  let seed = 20261003;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const differences = [];
  for (let iteration = 0; iteration < 5000; iteration++) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    differences.push(quantile(sample.map(pair => pair.after), q) - quantile(sample.map(pair => pair.before), q));
  }
  return [round(quantile(differences, 0.025)), round(quantile(differences, 0.975))];
}

export function summarize(raw) {
  const groups = new Map();
  for (const sample of raw.samples) {
    const key = `${sample.viewport}/${sample.scenario}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  const cells = [];
  for (const [key, samples] of groups) {
    const kind = samples[0].kind;
    const metrics = kind === 'click' ? ['clickToContentReadyMs']
      : ['fcpMs', 'lcpMs', 'ttfbMs', 'contentReadyMs', 'cls'];
    if (kind === 'document' && samples[0].route === '/' && raw.measurementRevision === 'independent-first-screen-complete-journey-v3') {
      metrics.push('previewVisibleMs', 'heroHdReadyMs');
    }
    if (samples[0].viewport === 'mobile' && !raw.measurementRevision?.startsWith('immediate-click-')) metrics.push('menuFeedbackMs');
    if (samples[0].route === '/register/school') metrics.push('emailFeedbackMs');
    for (const metric of metrics) {
      const pairs = [];
      for (let roundNumber = 1; roundNumber <= raw.config.rounds; roundNumber++) {
        const before = samples.find(row => row.round === roundNumber && row.variant === 'before');
        const after = samples.find(row => row.round === roundNumber && row.variant === 'after');
        if (Number.isFinite(before?.metrics?.[metric]) && Number.isFinite(after?.metrics?.[metric])) {
          pairs.push({ round: roundNumber, before: before.metrics[metric], after: after.metrics[metric] });
        }
      }
      const failures = samples.filter(sample => sample.failures.length).map(sample => ({
        round: sample.round, variant: sample.variant, reasons: sample.failures }));
      const beforeValues = pairs.map(pair => pair.before), afterValues = pairs.map(pair => pair.after);
      const beforeMedian = quantile(beforeValues, 0.5), afterMedian = quantile(afterValues, 0.5);
      const beforeP75 = quantile(beforeValues, 0.75), afterP75 = quantile(afterValues, 0.75);
      const tolerance = metric === 'cls' ? 0.02 : Math.max(metric.endsWith('FeedbackMs') ? 20 : 100, (beforeMedian ?? 0) * 0.1);
      const ci95MedianDifference = pairs.length ? bootstrap(pairs, 0.5) : [null, null];
      const ci95P75Difference = pairs.length ? bootstrap(pairs, 0.75) : [null, null];
      let status = 'INCONCLUSIVE';
      if (failures.length || (metric === 'cls' && afterP75 > 0.1)) status = 'FAIL';
      else if (pairs.length >= 5 && (ci95MedianDifference[0] > tolerance || ci95P75Difference[0] > tolerance)) status = 'FAIL';
      else if (!raw.config.smoke && pairs.length >= 10 && pairs.length === raw.config.rounds
        && ci95MedianDifference[1] <= tolerance && ci95P75Difference[1] <= tolerance
        && afterP75 - beforeP75 <= tolerance) status = 'PASS';
      cells.push({ cell: key, metric, status, pairs: pairs.length, tolerance: round(tolerance),
        before: { median: round(beforeMedian), p75: round(beforeP75), min: round(quantile(beforeValues, 0)), max: round(quantile(beforeValues, 1)) },
        after: { median: round(afterMedian), p75: round(afterP75), min: round(quantile(afterValues, 0)), max: round(quantile(afterValues, 1)) },
        medianDifference: beforeMedian === null ? null : round(afterMedian - beforeMedian),
        p75Difference: beforeP75 === null ? null : round(afterP75 - beforeP75),
        ci95MedianDifference, ci95P75Difference, pairedDeltas: pairs.map(pair => ({ round: pair.round, delta: round(pair.after - pair.before) })), failures });
    }
  }
  const plannedSamples = raw.config.rounds * raw.config.viewports.length * 2 * (raw.config.routes.length * 2 + 2);
  const complete = raw.samples.length === plannedSamples;
  const absoluteGates = raw.measurementRevision !== 'independent-first-screen-complete-journey-v3' ? []
    : cells.filter(cell => /\/(cold|warm)-home$/.test(cell.cell) && ['previewVisibleMs', 'lcpMs'].includes(cell.metric))
      .map(cell => {
        const limitMs = cell.metric === 'previewVisibleMs' ? 2000 : 2500;
        const sufficient = !raw.config.smoke && cell.pairs >= 10 && cell.pairs === raw.config.rounds;
        return { cell: cell.cell, metric: cell.metric, pairs: cell.pairs, limitMs, beforeP75Ms: cell.before.p75,
          afterP75Ms: cell.after.p75, status: cell.failures.length ? 'FAIL' : !sufficient ? 'INCONCLUSIVE'
            : cell.after.p75 <= limitMs ? 'PASS' : 'FAIL' };
      });
  const verdicts = [...cells, ...absoluteGates];
  const status = verdicts.some(cell => cell.status === 'FAIL') ? 'FAIL'
    : complete && !raw.fatalError && !raw.interrupted && verdicts.length && verdicts.every(cell => cell.status === 'PASS') ? 'PASS' : 'INCONCLUSIVE';
  return { createdAt: new Date().toISOString(), status, complete, actualSamples: raw.samples.length, plannedSamples,
    interpretation: 'PASS means no regression detected beyond the declared lab tolerance, not unchanged speed or production/mainland performance. INCONCLUSIVE is not PASS.',
    methodology: { profile: raw.config.profile, rounds: raw.config.rounds, motion: raw.config.motion,
      serviceWorkers: 'blocked', pairing: 'Same round/viewport/scenario, alternating before-after order',
      bootstrap: '5000 deterministic resamples of pairs; 95% percentile intervals for difference of medians and p75s',
      baseline: raw.config.variants.before.label, candidate: raw.config.variants.after.label }, cells, absoluteGates };
}

export async function writeSummary(raw, output) {
  const result = summarize(raw);
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(result, null, 2));
  const fmt = value => value === null ? '—' : String(value);
  const lines = ['# Public page performance comparison', '', `Status: **${result.status}**. Samples: ${result.actualSamples}/${result.plannedSamples}.`, '',
    result.interpretation, '', `Profile: ${raw.config.profile}; rounds: ${raw.config.rounds}; browser: isolated Chromium; service workers blocked.`, '',
    '| Cell | Metric | Pairs | Before median / p75 | After median / p75 | Median difference 95% CI | p75 difference 95% CI | Tolerance | Result |',
    '| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |'];
  for (const cell of result.cells) lines.push(`| ${cell.cell} | ${cell.metric} | ${cell.pairs} | ${fmt(cell.before.median)} / ${fmt(cell.before.p75)} | ${fmt(cell.after.median)} / ${fmt(cell.after.p75)} | ${cell.ci95MedianDifference.map(fmt).join(' … ')} | ${cell.ci95P75Difference.map(fmt).join(' … ')} | ${cell.tolerance} | ${cell.status} |`);
  if (result.absoluteGates.length) {
    lines.push('', '## Independent homepage absolute gates', '',
      'Relative non-regression does not establish these targets. Each gate requires ten complete pairs and no functional failures.', '',
      '| Cell | Metric | Pairs | Before p75 (ms) | After p75 (ms) | Limit (ms) | Result |',
      '| --- | --- | ---: | ---: | ---: | ---: | --- |');
    for (const gate of result.absoluteGates) lines.push(`| ${gate.cell} | ${gate.metric} | ${gate.pairs} | ${fmt(gate.beforeP75Ms)} | ${fmt(gate.afterP75Ms)} | ${gate.limitMs} | ${gate.status} |`);
  }
  const failedSamples = raw.samples.filter(sample => sample.failures.length);
  if (failedSamples.length) {
    lines.push('', '## Functional or measurement failures', '');
    for (const sample of failedSamples) lines.push(`- Round ${sample.round}, ${sample.variant}, ${sample.viewport}/${sample.scenario}: ${sample.failures.join('; ')}`);
  }
  lines.push('', 'All timing values are milliseconds; CLS is unitless. Native LCP is limited to each recorded observation window. No SPA FCP/LCP/INP or real mainland-network claim is made.');
  await writeFile(path.join(output, 'summary.md'), `${lines.join('\n')}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/performance/summarize.mjs <raw.json>');
  const input = path.resolve(process.argv[2]);
  const result = await writeSummary(JSON.parse(await readFile(input, 'utf8')), path.dirname(input));
  console.log(JSON.stringify({ status: result.status, samples: result.actualSamples, complete: result.complete }));
}
