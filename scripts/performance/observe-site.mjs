import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routes, profiles } from './options.mjs';
import { createSampleBrowser, sampleDocument, sampleClick } from './sample.mjs';

const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--url', '--api-url', '--output'].includes(args[index]) || !args[index + 1]) {
    throw new Error('Usage: observe-site.mjs --url <https-origin> --api-url <https-origin> --output <new-directory>');
  }
  options[args[index].slice(2)] = args[index + 1];
}
function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Public observation requires HTTPS origins without credentials, path, query or fragment.');
  }
  return url.origin;
}
if (!options.url || !options['api-url'] || !options.output) throw new Error('URL, API URL and output are required.');
const definition = { webUrl: origin(options.url), apiOrigin: origin(options['api-url']), cdnOrigin: null,
  label: 'Current deployed public site; no candidate comparison', locality: 'remote' };
const config = { rounds: 3, viewports: ['desktop', 'mobile'], routes: Object.keys(routes), directContext: true, expectedTraceCountry: 'CN',
  profile: 'unthrottled', observationMs: 5000, motion: 'no-preference', readOnlyPublic: true,
  output: path.resolve(options.output), variants: { site: definition }, maximumMinutes: 14 };
await mkdir(config.output, { recursive: true });
const rawPath = path.join(config.output, 'raw.json');
try { await readFile(rawPath); throw new Error('Output already contains raw.json; use a fresh directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const planned = [];
for (let round = 1; round <= config.rounds; round++) for (const viewport of config.viewports) {
  for (const name of config.routes) for (const cache of ['cold', 'warm']) {
    planned.push({ round, variant: 'site', viewport, scenario: `${cache}-${name}` });
  }
  for (const target of ['about', 'register']) planned.push({ round, variant: 'site', viewport, scenario: `click-home-${target}` });
}
const raw = { schemaVersion: 1, measurementRevision: 'single-site-public-context-direct-v2', startedAt: new Date().toISOString(),
  config, planned, samples: [], browserTrace: [],
  environment: { platform: os.platform(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, nodeVersion: process.version,
    chromiumArguments: ['--no-proxy-server'], profile: profiles.unthrottled,
    limitations: ['Single deployed site, no A/B or non-regression verdict.',
      'One actual network path; mobile viewport on Mac is not a physical mobile device.',
      'Browser proxy bypass does not independently verify OS route or physical location.',
      'Only initial viewport observation window; not whole-visit CLS/INP.',
      'Natural page requests are not intercepted; non-read API calls are passively listed.'] } };
const source = path.dirname(fileURLToPath(import.meta.url));
const manifest = {};
await mkdir(path.join(config.output, 'harness-source'));
for (const name of ['observe-site.mjs', 'observe-site-contract.md', 'sample.mjs', 'browser-observers.mjs', 'first-screen-observer.mjs', 'network.mjs', 'options.mjs']) {
  const body = await readFile(path.join(source, name));
  manifest[name] = createHash('sha256').update(body).digest('hex');
  await writeFile(path.join(config.output, 'harness-source', name), body);
}
raw.harnessDigest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
await writeFile(path.join(config.output, 'harness-source', 'manifest.json'), JSON.stringify({ files: manifest, digest: raw.harnessDigest }, null, 2));
const save = async () => {
  raw.updatedAt = new Date().toISOString();
  await writeFile(`${rawPath}.tmp`, JSON.stringify(raw, null, 2));
  await rename(`${rawPath}.tmp`, rawPath);
};
const identity = row => `${row.round}/${row.viewport}/${row.scenario}`;
function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = probability => {
    if (!sorted.length) return null;
    const offset = (sorted.length - 1) * probability, low = Math.floor(offset);
    return sorted[low] + (sorted[Math.ceil(offset)] - sorted[low]) * (offset - low);
  };
  return { count: sorted.length, median: quantile(0.5), p75: quantile(0.75), min: sorted[0] ?? null, max: sorted.at(-1) ?? null };
}
async function summarize() {
  const seen = new Set(raw.samples.map(identity));
  const missing = planned.filter(row => !seen.has(identity(row)));
  const failed = raw.samples.filter(row => row.failures.length);
  const cells = [];
  for (const viewport of config.viewports) for (const scenario of [...new Set(planned.map(row => row.scenario))]) {
    const rows = raw.samples.filter(row => row.viewport === viewport && row.scenario === scenario);
    const valid = rows.filter(row => !row.failures.length && row.precedingColdSucceeded !== false);
    const names = [...new Set(valid.flatMap(row => Object.keys(row.metrics ?? {})))];
    cells.push({ viewport, scenario, observed: rows.length, metricEligible: valid.length,
      successful: rows.filter(row => !row.failures.length).length, failed: rows.filter(row => row.failures.length).length,
      partialWarmPriming: rows.filter(row => row.precedingColdSucceeded === false).length,
      metrics: Object.fromEntries(names.map(name => [name, statistics(valid.map(row => row.metrics[name]))])),
      failures: rows.filter(row => row.failures.length).map(row => ({ round: row.round, failures: row.failures })) });
  }
  const missingTrace = ['before', 'after'].filter(phase => !raw.browserTrace.some(row => row.phase === phase));
  const traceFailures = raw.browserTrace.filter(row => row.error);
  const summary = { createdAt: new Date().toISOString(), status: missing.length || raw.fatalError || raw.interrupted || missingTrace.length
    ? 'INCOMPLETE' : failed.length || traceFailures.length ? 'OBSERVED_WITH_ERRORS' : 'OBSERVED',
    interpretation: 'Descriptive single-site observations only. No A/B comparison, non-regression PASS, or nationwide performance claim.',
    plannedSamples: planned.length, observedSamples: raw.samples.length, successfulSamples: raw.samples.length - failed.length,
    failedSamples: failed.length, timeoutSamples: failed.filter(row => row.failures.some(value => /timeout/i.test(value))).length, missing, cells,
    browserTrace: raw.browserTrace, missingTrace, traceFailures, fatalError: raw.fatalError ?? null, harnessDigest: raw.harnessDigest };
  await writeFile(path.join(config.output, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}
async function trace(harness, phase) {
  const tab = await harness.context.newPage();
  const session = await harness.context.newCDPSession(tab);
  await session.send('Network.enable');
  const result = { phase, at: new Date().toISOString(), browserVersion: harness.browserVersion,
    note: 'Isolated browser request with the measurement launch configuration; country/colo is probe evidence only.' };
  session.on('Network.responseReceived', event => {
    if (event.response.url !== 'https://www.cloudflare.com/cdn-cgi/trace') return;
    const response = event.response;
    result.transport = { protocol: response.protocol, remotePort: response.remotePort,
      addressFamily: response.remoteIPAddress?.includes(':') ? 'IPv6' : 'IPv4',
      fromDiskCache: response.fromDiskCache, fromServiceWorker: response.fromServiceWorker };
  });
  try {
    const response = await tab.goto('https://www.cloudflare.com/cdn-cgi/trace', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    result.status = response?.status();
    const values = Object.fromEntries((await tab.locator('body').innerText()).split('\n').map(line => line.split('=', 2)));
    result.country = /^[A-Z]{2}$/.test(values.loc ?? '') ? values.loc : null;
    result.colo = /^[A-Z0-9]{3,8}$/.test(values.colo ?? '') ? values.colo : null;
    result.traceFields = Object.fromEntries(['ts', 'http', 'warp'].map(name => [name, values[name] ?? null]));
    if (!response?.ok() || !result.country || !result.colo) result.error = 'Trace did not return expected country/colo.';
    if (result.country !== config.expectedTraceCountry || result.transport?.remotePort !== 443
      || result.transport.fromDiskCache || result.transport.fromServiceWorker) result.error = 'Browser direct-network evidence did not satisfy the declared country/transport prerequisite.';
  } catch (error) { result.error = String(error.message).split('\n')[0].slice(0, 200); }
  finally { await tab.close().catch(() => {}); }
  raw.browserTrace.push(result); await save();
  return result;
}
let active, stopping = false;
const stop = reason => { stopping = true; raw.stopReason = reason; void active?.browser.close(); };
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(signal));
const deadline = setTimeout(() => stop('14-minute deadline'), 14 * 60_000);
await save();
try {
  outer: for (let round = 1; round <= config.rounds; round++) {
    for (const viewport of config.viewports) {
      for (const journey of [...config.routes.map(name => ({ name })), { target: '/about' }, { target: '/register' }]) {
        if (stopping) break outer;
        active = await createSampleBrowser(config, definition, viewport);
        try {
          if (!raw.browserTrace.length && (await trace(active, 'before')).error) throw new Error('Browser trace prerequisite failed; no production page samples were started.');
          const scenarios = journey.name ? [`cold-${journey.name}`, `warm-${journey.name}`] : [`click-home-${journey.target.slice(1)}`];
          let coldSucceeded;
          for (const scenario of scenarios) {
            if (stopping) break;
            const row = { round, variant: 'site', viewport, scenario };
            const sample = journey.name ? await sampleDocument(active, config, row, routes[journey.name])
              : await sampleClick(active, config, row, journey.target);
            if (scenario.startsWith('cold-')) coldSucceeded = sample.failures.length === 0;
            if (scenario.startsWith('warm-')) sample.precedingColdSucceeded = coldSucceeded;
            sample.nonReadApiRequests = sample.validationNetwork.resources.filter(row => row.host === 'api'
              && !['GET', 'HEAD', 'OPTIONS'].includes(row.method)).map(({ method, origin, path: pathname }) => ({ method, origin, path: pathname }));
            raw.samples.push(sample); await save();
            console.log(JSON.stringify({ ...row, metrics: sample.metrics, failures: sample.failures, completed: raw.samples.length, planned: planned.length }));
          }
          if (raw.samples.length === planned.length && !stopping) await trace(active, 'after');
        } finally { await active.browser.close().catch(() => {}); active = null; }
      }
    }
    await summarize();
  }
} catch (error) { raw.fatalError = String(error.message).split('\n')[0].slice(0, 250); }
finally {
  clearTimeout(deadline); await active?.browser.close().catch(() => {});
  raw.finishedAt = new Date().toISOString(); raw.interrupted = stopping; await save();
}
const summary = await summarize();
console.log(JSON.stringify({ output: config.output, status: summary.status, observed: raw.samples.length, failed: summary.failedSamples }));
process.exitCode = summary.status === 'INCOMPLETE' ? 2 : summary.status === 'OBSERVED_WITH_ERRORS' ? 1 : 0;
