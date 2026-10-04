import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readOptions, routes, profiles } from './options.mjs';
import { createSampleBrowser, sampleDocument, sampleClick } from './sample.mjs';
import { writeSummary } from './summarize.mjs';

const config = await readOptions(process.argv.slice(2));
await mkdir(config.output, { recursive: true });
const rawPath = path.join(config.output, 'raw.json');
const measurementRevision = 'independent-first-screen-complete-journey-v3';
let raw = { schemaVersion: 3, measurementRevision, startedAt: new Date().toISOString(), config,
  environment: { platform: os.platform(), arch: os.arch(), cpuModel: os.cpus()[0]?.model,
    logicalCpuCount: os.cpus().length, nodeVersion: process.version,
    chromiumArguments: ['--no-proxy-server'], profile: profiles[config.profile],
    networkClaim: 'Local browser proxy bypass only; OS TUN/VPN and physical geography are not verified by this harness.' },
  samples: [] };
if (config.resume) {
  raw = JSON.parse(await readFile(rawPath, 'utf8'));
  if (raw.measurementRevision !== measurementRevision) throw new Error('Cannot resume evidence with a different measurement contract.');
  for (const key of ['rounds', 'profile', 'viewports', 'routes', 'observationMs', 'motion', 'variants']) {
    if (JSON.stringify(raw.config[key]) !== JSON.stringify(config[key])) throw new Error(`Resume config mismatch: ${key}`);
  }
} else {
  try { await readFile(rawPath); throw new Error('Output already contains raw.json; use a new directory or --resume.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!config.resume) {
  const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
  const snapshot = path.join(config.output, 'harness-source');
  await mkdir(snapshot, { recursive: true });
  const files = [];
  for (const file of ['compare.mjs', 'browser-observers.mjs', 'first-screen-observer.mjs', 'network.mjs', 'options.mjs', 'sample.mjs', 'summarize.mjs']) {
    const body = await readFile(path.join(sourceRoot, file));
    await writeFile(path.join(snapshot, file), body);
    files.push({ file, sha256: createHash('sha256').update(body).digest('hex') });
  }
  raw.harnessDigest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  await writeFile(path.join(snapshot, 'manifest.json'), JSON.stringify({ digest: raw.harnessDigest, files }, null, 2));
} else {
  const manifest = JSON.parse(await readFile(path.join(config.output, 'harness-source/manifest.json'), 'utf8'));
  if (manifest.digest !== raw.harnessDigest) throw new Error('Archived harness digest differs from the raw evidence.');
  for (const file of manifest.files) {
    const body = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), file.file));
    if (createHash('sha256').update(body).digest('hex') !== file.sha256) throw new Error(`Resume harness changed: ${file.file}`);
  }
}
const save = async () => {
  raw.updatedAt = new Date().toISOString();
  await writeFile(`${rawPath}.tmp`, JSON.stringify(raw, null, 2));
  await rename(`${rawPath}.tmp`, rawPath);
};
const already = identity => raw.samples.some(sample => ['round', 'variant', 'viewport', 'scenario'].every(key => sample[key] === identity[key]));
let active;
let stopping = false;
process.once('SIGINT', () => { stopping = true; void active?.browser.close(); });
process.once('SIGTERM', () => { stopping = true; void active?.browser.close(); });
await save();
try {
  outer: for (let round = 1; round <= config.rounds; round++) {
    const order = round % 2 ? ['before', 'after'] : ['after', 'before'];
    for (const viewport of config.viewports) {
      for (const journey of [...config.routes.map(route => ({ route })), { target: '/about' }, { target: '/register' }]) {
        for (const variant of order) {
          if (stopping) break outer;
          const definition = config.variants[variant];
          if (definition.expiresAt && Date.parse(definition.expiresAt) < Date.now()) throw new Error(`${variant} session expired during sampling.`);
          const scenarios = journey.route ? [`cold-${journey.route}`, `warm-${journey.route}`] : [`click-home-${journey.target.slice(1)}`];
          if (scenarios.every(scenario => already({ round, variant, viewport, scenario }))) continue;
          active = await createSampleBrowser(config, definition, viewport);
          try {
            for (const scenario of scenarios) {
              const identity = { round, variant, viewport, scenario, order: order.join('-') };
              // If only the warm sample remains on resume, repeat cold to re-prime this fresh context.
              const sample = journey.route
                ? await sampleDocument(active, config, identity, routes[journey.route])
                : await sampleClick(active, config, identity, journey.target);
              if (!already(identity)) {
                raw.samples.push(sample);
                await save();
                console.log(JSON.stringify({ ...identity, metrics: sample.metrics, failures: sample.failures,
                  completeSamples: raw.samples.length }));
              }
              if (stopping) break;
            }
          } finally { await active.browser.close(); active = null; }
        }
      }
    }
    await writeSummary(raw, config.output);
  }
} catch (error) {
  raw.fatalError = String(error.message).split('\n')[0];
  throw error;
} finally {
  await active?.browser.close();
  raw.finishedAt = new Date().toISOString(); raw.interrupted = stopping;
  await save();
  await writeSummary(raw, config.output);
}
const summary = await writeSummary(raw, config.output);
console.log(JSON.stringify({ output: config.output, status: summary.status, samples: raw.samples.length }));
if (summary.status === 'FAIL') process.exitCode = 1;
else if (summary.status === 'INCONCLUSIVE') process.exitCode = 2;
