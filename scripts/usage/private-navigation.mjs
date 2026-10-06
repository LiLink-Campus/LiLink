import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { assertTestDatabase } from '../e2e/environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const revision = 'private-navigation-v1';
const journeys = {
  center: { source: '/dashboard/me', target: '/dashboard/referrals', sourceHeading: '用户中心', targetHeading: '我的邀请', link: '我的邀请' },
  admin: { source: '/admin', target: '/admin/merchants', sourceHeading: '运营概览', targetHeading: '合作商家', link: '合作商家' },
};
const cells = ['desktop', 'mobile'].flatMap(viewport => Object.keys(journeys)
  .flatMap(journey => ['hover', 'focus', 'touch', 'quick'].map(intent => ({ viewport, journey, intent }))));
const gate = { minimumPairs: 10, metrics: ['clickReadyMs', 'backReadyMs'],
  tolerance: 'max(100ms, 10% of baseline median)', bootstrapResamples: 5000,
  functionalOrMissingEvidence: 'FAIL', incompleteConfidenceInterval: 'INCONCLUSIVE' };
const unavailableLocalTelemetry = row => row.category === 'telemetry' && row.status === 404
  && ['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js'].includes(row.path);
const networkRequest = row => row.wireStatus === 304 || (!row.fromDiskCache && !row.fromMemoryCache && !row.fromServiceWorker);
const digest = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * q, low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
};
const rounded = value => value === null ? null : Number(value.toFixed(3));
function confidence(pairs, q) {
  let seed = 20261006;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const deltas = Array.from({ length: gate.bootstrapResamples }, () => {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)]);
    return quantile(sample.map(row => row.after), q) - quantile(sample.map(row => row.before), q);
  });
  return [rounded(quantile(deltas, 0.025)), rounded(quantile(deltas, 0.975))];
}
function counts(rows) {
  const network = rows.filter(networkRequest);
  return { initiated: rows.length, network: network.length,
    wireResponses: network.filter(row => row.wireStatus !== null).length,
    cancelledBeforeResponse: network.filter(row => row.completion === 'cancelled' && row.wireStatus === null).length,
    diskCache: rows.filter(row => row.fromDiskCache).length,
    memoryCache: rows.filter(row => row.fromMemoryCache && !row.fromDiskCache).length,
    worker: rows.filter(row => row.fromServiceWorker).length,
    wire304: rows.filter(row => row.wireStatus === 304).length,
    completed: rows.filter(row => row.completion === 'finished' || row.completion === 'redirect').length,
    cancelled: rows.filter(row => row.completion === 'cancelled').length,
    failed: rows.filter(row => row.completion === 'failed' || row.status >= 400).length,
    applicationFailed: rows.filter(row => (row.completion === 'failed' || row.status >= 400) && !unavailableLocalTelemetry(row)).length,
    unavailableLocalTelemetry: rows.filter(unavailableLocalTelemetry).length,
    incomplete: rows.filter(row => row.completion === 'incomplete').length,
    networkTransferBytes: network.reduce((sum, row) => sum + row.transferBytes, 0) };
}
function summarize(raw) {
  if (raw.revision !== revision) throw new Error('Unsupported measurement contract.');
  const expected = cells.length * raw.config.rounds * (raw.config.paired ? 2 : 1);
  const complete = raw.samples.length === expected && !raw.fatal && !raw.interrupted;
  const reports = cells.map(cell => {
    const key = `${cell.viewport}/${cell.journey}/${cell.intent}`;
    const samples = raw.samples.filter(sample => Object.keys(cell).every(name => sample[name] === cell[name]));
    const functional = samples.length === raw.config.rounds * (raw.config.paired ? 2 : 1)
      && samples.every(sample => sample.failures.length === 0);
    const metrics = gate.metrics.map(metric => {
      const pairs = Array.from({ length: raw.config.rounds }, (_, number) => {
        const before = samples.find(row => row.round === number + 1 && row.variant === 'before');
        const after = samples.find(row => row.round === number + 1 && row.variant === 'after');
        return { round: number + 1, before: before?.metrics[metric], after: after?.metrics[metric] };
      }).filter(pair => Number.isFinite(pair.before) && Number.isFinite(pair.after));
      const before = pairs.map(pair => pair.before), after = pairs.map(pair => pair.after);
      const bm = quantile(before, .5), am = quantile(after, .5), bp = quantile(before, .75), ap = quantile(after, .75);
      const tolerance = Math.max(100, (bm ?? 0) * .1);
      const medianCi95 = pairs.length ? confidence(pairs, .5) : [null, null];
      const p75Ci95 = pairs.length ? confidence(pairs, .75) : [null, null];
      let status = 'OBSERVATION';
      if (raw.config.paired) {
        if (!functional || pairs.length !== raw.config.rounds || pairs.length < gate.minimumPairs) status = 'FAIL';
        else if (am - bm > tolerance || ap - bp > tolerance || medianCi95[0] > tolerance || p75Ci95[0] > tolerance) status = 'FAIL';
        else status = medianCi95[1] <= tolerance && p75Ci95[1] <= tolerance ? 'PASS' : 'INCONCLUSIVE';
      }
      return { metric, status, pairs: pairs.length, tolerance: rounded(tolerance),
        before: { median: rounded(bm), p75: rounded(bp) }, after: { median: rounded(am), p75: rounded(ap) },
        medianCi95, p75Ci95, pairedDeltas: pairs.map(pair => ({ round: pair.round, delta: rounded(pair.after - pair.before) })) };
    });
    const resources = Object.fromEntries(['before', 'after'].map(variant => {
      const rows = samples.filter(row => row.variant === variant);
      return [variant, rows.length ? { samples: rows.length,
        unusedPrefetch: rows.map(row => row.unusedPrefetch),
        counts: rows.map(row => row.counts), categories: rows.map(row => row.categories) } : null];
    }));
    return { cell: key, functional, metrics, resources, failures: samples.flatMap(row => row.failures.map(reason => ({ round: row.round, variant: row.variant, reason }))) };
  });
  const status = !complete || reports.some(row => !row.functional || row.metrics.some(metric => metric.status === 'FAIL')) ? 'FAIL'
    : !raw.config.paired ? 'OBSERVATION' : reports.every(row => row.metrics.every(metric => metric.status === 'PASS')) ? 'PASS' : 'INCONCLUSIVE';
  return { revision, status, complete, expectedSamples: expected, actualSamples: raw.samples.length, gate, cells: reports,
    limitations: ['Local isolated Chromium; unthrottled loopback; service workers blocked; desktop touch emulated.',
      'Path-level unused prefetch is not proof of unused chunks. CDN HIT still costs a request on Vercel.',
      'No Vercel usage/CPU/billing, physical iOS, mainland, or production claim.'] };
}
async function saveSummary(raw, output) {
  const summary = summarize(raw);
  await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const lines = ['# Private navigation comparison', '', `Result: **${summary.status}**. Samples: ${summary.actualSamples}/${summary.expectedSamples}.`, '',
    'Local browser observations, not Vercel bills. All timings are milliseconds. Ten complete pairs per cell are required.', '',
    '| Cell | Metric | Pairs | Before median / p75 | After median / p75 | Median 95% CI | p75 95% CI | Tolerance | Gate |',
    '| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |'];
  for (const cell of summary.cells) for (const metric of cell.metrics) lines.push(`| ${cell.cell} | ${metric.metric} | ${metric.pairs} | ${metric.before.median ?? '—'} / ${metric.before.p75 ?? '—'} | ${metric.after.median ?? '—'} / ${metric.after.p75 ?? '—'} | ${metric.medianCi95.join(' … ')} | ${metric.p75Ci95.join(' … ')} | ${metric.tolerance} | ${metric.status} |`);
  lines.push('', '## Observed request totals', '', '| Cell | Variant | Samples | Initiated / network | Unused prefetch | Cancelled / failed / incomplete |', '| --- | --- | ---: | ---: | ---: | ---: |');
  for (const cell of summary.cells) for (const [variant, rows] of Object.entries(cell.resources)) {
    if (!rows) continue;
    const sum = key => rows.counts.reduce((total, row) => total + row[key], 0);
    lines.push(`| ${cell.cell} | ${variant} | ${rows.samples} | ${sum('initiated')} / ${sum('network')} | ${rows.unusedPrefetch.reduce((total, row) => total + row.length, 0)} | ${sum('cancelled')} / ${sum('failed')} / ${sum('incomplete')} |`);
  }
  for (const cell of summary.cells) for (const failure of cell.failures) lines.push(`\n- ${cell.cell}, ${failure.variant}, round ${failure.round}: ${failure.reason}`);
  lines.push('', ...summary.limitations.map(value => `- ${value}`));
  await writeFile(path.join(output, 'summary.md'), `${lines.join('\n')}\n`);
  return summary;
}

async function sourceIdentity(workspace, sourceRoot, explicitRevision) {
  const files = ['apps/web/src/app/dashboard/me/user-center.tsx', 'apps/web/src/app/admin/admin-layout-shell.tsx',
    'apps/web/next.config.ts', 'package-lock.json'];
  const sourceRevision = explicitRevision ?? git(sourceRoot, ['rev-parse', 'HEAD']);
  const manifest = [];
  for (const file of files) {
    const sha256 = digest(await readFile(path.join(workspace, file)));
    let matchesRevision = false;
    try { matchesRevision = sha256 === digest(execFileSync('git', ['show', `${sourceRevision}:${file}`], { cwd: sourceRoot, stdio: ['ignore', 'pipe', 'pipe'] })); } catch {}
    manifest.push({ file, sha256, matchesRevision });
  }
  return { buildId: (await readFile(path.join(workspace, 'apps/web/.next/BUILD_ID'), 'utf8')).trim(),
    revisionAtCapture: sourceRevision, revisionAgreementCoversManifestOnly: true, manifest, sourceDigest: digest(JSON.stringify(manifest)) };
}
async function canonical(input) {
  const file = await realpath(input), sourceRoot = path.resolve(path.dirname(file), '../../..');
  if (!/\/artifacts\/e2e\/[a-f0-9]{12}\/session\.json$/.test(file)) throw new Error('Canonical E2E session path required.');
  const common = cwd => realpath(path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir'])));
  if (await common(sourceRoot) !== await common(root)) throw new Error('Session belongs to another repository.');
  const helper = await import(pathToFileURL(path.join(sourceRoot, 'scripts/performance/local-session.mjs')));
  return { helper, sourceRoot, session: await helper.readDisposableSession(file) };
}
async function accounts(session, sourceRoot) {
  const container = `lilink-e2e-db-${session.runId}`;
  const label = execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "lilink.e2e"}}', container], { encoding: 'utf8' }).trim();
  const binding = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' }).trim();
  if (label !== session.runId || !/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Runner-owned loopback database required.');
  const databaseUrl = `postgresql://e2e:e2e@${binding}/lilink_e2e_${session.runId}`;
  assertTestDatabase(databaseUrl);
  const require = createRequire(path.join(sourceRoot, 'artifacts/e2e', session.runId, 'workspace/apps/api/package.json'));
  const prior = process.env.DATABASE_URL;
  let db;
  try { process.env.DATABASE_URL = databaseUrl; db = require('./dist/src/common/prisma/client.js').createPrismaClient(); }
  finally { if (prior === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prior; }
  try {
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await require('argon2').hash(password);
    const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
    const user = await db.user.create({ data: { email: `${randomUUID()}@school.example.test`, passwordHash,
      displayName: '导航验收同学', status: 'ACTIVE', schoolId: school.id, acceptedTermsAt: new Date() } });
    const admin = await db.adminOperator.create({ data: { email: `${randomUUID()}@example.test`, passwordHash, displayName: '导航验收管理员' } });
    return { center: { email: user.email, password }, admin: { email: admin.email, password } };
  } finally { await db.$disconnect(); }
}
function ledger(cdp, origin, apiOrigin, phase) {
  const resources = [], byId = new Map(), extra = new Map();
  const classify = (url, type, headers) => {
    if (url.origin === apiOrigin) return 'direct-api';
    if (url.origin !== origin) return 'external';
    if (url.pathname === '/monitoring' || url.pathname.startsWith('/_vercel/')) return 'telemetry';
    if (url.pathname.startsWith('/api/')) return 'same-origin-api';
    if (headers.RSC === '1' || headers.rsc === '1' || url.searchParams.has('_rsc')) return 'rsc';
    if (type === 'Script' || url.pathname.endsWith('.js')) return 'javascript';
    if (type === 'Stylesheet' || url.pathname.endsWith('.css')) return 'css';
    return type === 'Document' ? 'document' : 'other-asset';
  };
  cdp.on('Network.requestWillBeSent', event => {
    if (!event.request.url.startsWith('http')) return;
    const prior = byId.get(event.requestId);
    if (event.redirectResponse && prior) {
      Object.assign(prior, { completion: 'redirect', status: event.redirectResponse.status,
        fromDiskCache: !!event.redirectResponse.fromDiskCache, fromServiceWorker: !!event.redirectResponse.fromServiceWorker,
        transferBytes: event.redirectResponse.encodedDataLength ?? 0 });
      extra.delete(event.requestId);
    }
    const url = new URL(event.request.url), headers = Object.fromEntries(Object.entries(event.request.headers).map(([key, value]) => [key.toLowerCase(), value]));
    const row = { id: resources.length + 1, path: url.pathname, category: classify(url, event.type, headers),
      phase: phase.value, method: event.request.method, type: event.type, atMs: Math.round(performance.now() - phase.started),
      prefetch: headers['next-router-prefetch'] === '1' || /prefetch/i.test(headers.purpose ?? headers['sec-purpose'] ?? ''),
      fromDiskCache: false, fromMemoryCache: false, fromServiceWorker: false, status: 0, wireStatus: null,
      transferBytes: 0, partialTransferBytes: 0, completion: 'incomplete' };
    resources.push(row); byId.set(event.requestId, row);
    if (extra.has(event.requestId)) row.wireStatus = extra.get(event.requestId);
  });
  cdp.on('Network.requestServedFromCache', event => { const row = byId.get(event.requestId); if (row) row.fromMemoryCache = true; });
  cdp.on('Network.responseReceivedExtraInfo', event => {
    extra.set(event.requestId, event.statusCode);
    const row = byId.get(event.requestId); if (row) row.wireStatus = event.statusCode;
  });
  cdp.on('Network.responseReceived', event => {
    const row = byId.get(event.requestId); if (row) Object.assign(row, { status: event.response.status,
      fromDiskCache: !!event.response.fromDiskCache, fromServiceWorker: !!event.response.fromServiceWorker });
  });
  cdp.on('Network.loadingFinished', event => { const row = byId.get(event.requestId); if (row) Object.assign(row, { completion: 'finished', transferBytes: event.encodedDataLength }); });
  cdp.on('Network.dataReceived', event => { const row = byId.get(event.requestId); if (row) row.partialTransferBytes += event.encodedDataLength; });
  cdp.on('Network.loadingFailed', event => { const row = byId.get(event.requestId); if (row) Object.assign(row,
    { completion: event.canceled ? 'cancelled' : 'failed', transferBytes: row.partialTransferBytes }); });
  return resources;
}
async function capture(browser, storageState, definition, session, cell, round, output, config) {
  const journey = journeys[cell.journey], label = `${cell.viewport}-${cell.journey}-${cell.intent}-${definition.variant}-${round}`;
  const context = await browser.newContext({ ...(cell.viewport === 'mobile' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 }, hasTouch: true }),
    baseURL: definition.url, storageState, locale: 'zh-CN', reducedMotion: 'reduce', serviceWorkers: 'block',
    extraHTTPHeaders: { 'cf-connecting-ip': `2001:db8:${randomBytes(2).toString('hex')}::1` } });
  const sample = { ...cell, round, variant: definition.variant, viewportSize: null,
    failures: [], metrics: {}, screenshots: [] };
  let stage = 'initialization';
  try {
    const page = await context.newPage(); page.setDefaultTimeout(15_000);
    page.on('pageerror', () => sample.failures.push('Browser JavaScript error.'));
    sample.viewportSize = page.viewportSize();
    const phase = { value: 'source-load', started: performance.now() };
    const cdp = await context.newCDPSession(page); await cdp.send('Network.enable');
    const resources = ledger(cdp, new URL(definition.url).origin, new URL(session.apiUrl).origin, phase);
    sample.resources = resources;
    const source = page.getByRole('heading', { name: journey.sourceHeading, exact: true, level: 1 });
    const target = page.getByRole('heading', { name: journey.targetHeading, exact: true, level: 1 });
    const snapshot = async state => {
      if (round !== 1) return;
      const name = `${label}-${state}.png`;
      await page.screenshot({ path: path.join(output, name), mask: [page.locator('[aria-label="账号信息"] p'),
        page.locator('[aria-label="我的邀请码"] code'), page.locator('table')] });
      sample.screenshots.push(name);
    };
    stage = 'source-heading'; await page.goto(journey.source, { waitUntil: 'domcontentloaded' }); await source.waitFor({ state: 'visible' });
    // A real pointer move prevents the fresh context's origin pointer from granting intent.
    await page.mouse.move(0, 0);
    stage = 'menu';
    if (cell.journey === 'admin' && cell.viewport === 'mobile') await page.getByRole('button', { name: '展开菜单', exact: true }).click();
    const link = cell.journey === 'admin' ? page.getByRole('navigation', { name: '后台导航', exact: true }).getByRole('link', { name: journey.link, exact: true })
      : page.getByRole('main').locator(`a[href="${journey.target}"]`);
    await link.waitFor({ state: 'visible' });
    phase.value = 'dwell'; await page.waitForTimeout(config.dwellMs);
    await snapshot('source');
    phase.value = 'intent'; stage = 'intent';
    if (cell.intent === 'hover') await link.hover();
    else if (cell.intent === 'focus') await link.focus();
    else if (cell.intent === 'touch') {
      const box = await link.boundingBox(); if (!box) throw new Error('Missing link geometry.');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    }
    if (cell.intent !== 'quick') await page.waitForTimeout(config.intentMs);
    phase.value = 'navigation'; stage = 'destination-ready'; const started = performance.now();
    if (cell.intent === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else if (cell.intent === 'focus') await page.keyboard.press('Enter');
    else if (cell.intent === 'quick') {
      const box = await link.boundingBox(); if (!box) throw new Error('Missing link geometry.');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else await link.click();
    await page.waitForURL(url => url.pathname === journey.target); await target.waitFor({ state: 'visible' });
    if (cell.journey === 'admin') {
      await page.getByRole('button', { name: '搜索', exact: true }).waitFor({ state: 'visible' });
      await page.getByText('正在加载列表…', { exact: true }).waitFor({ state: 'hidden' });
      if (await page.locator('main .ui-form-message--error').filter({ visible: true }).count()) throw new Error('Merchant data did not load.');
    }
    else await page.getByRole('region', { name: '我的邀请码', exact: true }).waitFor({ state: 'visible' });
    sample.metrics.clickReadyMs = rounded(performance.now() - started);
    await snapshot('destination');
    phase.value = 'return'; stage = 'back-ready'; const returning = performance.now();
    await page.goBack(); await page.waitForURL(url => url.pathname === journey.source); await source.waitFor({ state: 'visible' });
    sample.metrics.backReadyMs = rounded(performance.now() - returning);
    await snapshot('back'); phase.value = 'settlement'; stage = 'settlement';
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    if (await page.locator('main').evaluate(element => element.scrollWidth > element.clientWidth + 1)) sample.failures.push('Main content overflows its viewport.');
  } catch (error) {
    sample.failures.push(`${stage}: ${error.name === 'TimeoutError' ? 'timeout' : 'functional/measurement failure'}`);
  } finally { await context.close(); }
  const resources = sample.resources ?? [];
  sample.resources = resources;
  sample.counts = counts(resources);
  sample.categories = Object.fromEntries([...new Set(resources.map(row => row.category))].map(category => [category, counts(resources.filter(row => row.category === category))]));
  sample.unusedPrefetch = resources.filter(row => row.prefetch && row.category === 'rsc' && ![journey.source, journey.target].includes(row.path))
    .map(row => ({ id: row.id, path: row.path, phase: row.phase, network: networkRequest(row), completion: row.completion }));
  if (sample.counts.applicationFailed) sample.failures.push('Application HTTP or network failure observed.');
  if (sample.counts.incomplete) sample.failures.push('Unfinished request evidence.');
  return sample;
}

const args = process.argv.slice(2);
if (args[0] === '--summarize') {
  const input = path.resolve(args[1]), raw = JSON.parse(await readFile(input, 'utf8'));
  const summary = await saveSummary(raw, path.dirname(input));
  console.log(JSON.stringify({ status: summary.status, samples: summary.actualSamples }));
  process.exitCode = summary.status === 'FAIL' ? 1 : summary.status === 'INCONCLUSIVE' ? 2 : 0;
} else {
  const [input, outputText] = args;
  if (!input || !outputText) throw new Error('Usage: private-navigation.mjs <canonical-session> <new-output> [--phase before|after] [--pair <comparison-session>] [--rounds N]');
  const option = (name, fallback) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1]; };
  const comparisonPath = option('--pair', null), paired = !!comparisonPath;
  const config = { paired, rounds: Number(option('--rounds', paired ? 10 : 1)), dwellMs: 2000, intentMs: 250,
    phase: option('--phase', 'before'), serviceWorkers: 'blocked', network: 'unthrottled loopback' };
  if (!Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 20 || !['before', 'after'].includes(config.phase)) throw new Error('Invalid rounds or phase.');
  const { helper, sourceRoot, session } = await canonical(input);
  const baseline = paired ? await helper.readComparisonSession(comparisonPath) : null;
  if (baseline && (baseline.session.runId !== session.runId || baseline.comparison.active !== true || baseline.comparison.sharedSyntheticData !== true)) throw new Error('Active same-data baseline required.');
  const output = path.resolve(outputText); await mkdir(output, { recursive: true });
  const rawPath = path.join(output, 'raw.json');
  try { await readFile(rawPath); throw new Error('Use a new output directory.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const definitions = paired ? [{ variant: 'before', url: baseline.comparison.beforeUrl }, { variant: 'after', url: session.webUrl }]
    : [{ variant: config.phase, url: session.webUrl }];
  const raw = { revision, startedAt: new Date().toISOString(), runId: session.runId, config, gate,
    toolSha256: digest(await readFile(fileURLToPath(import.meta.url))), environment: { node: process.version, platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model },
    sources: {}, samples: [], reproduction: ['node scripts/usage/private-navigation.mjs <canonical-session> <new-output> --phase before',
      'node scripts/usage/private-navigation.mjs <canonical-session> <new-output> --pair <canonical-comparison-session>',
      'node scripts/usage/private-navigation.mjs --summarize <output>/raw.json'] };
  const save = async () => { await writeFile(`${rawPath}.tmp`, `${JSON.stringify(raw, null, 2)}\n`); await rename(`${rawPath}.tmp`, rawPath); };
  let browser, setupStage = 'source identity';
  process.once('SIGINT', () => { raw.interrupted = true; void browser?.close(); });
  process.once('SIGTERM', () => { raw.interrupted = true; void browser?.close(); });
  try {
    for (const definition of definitions) raw.sources[definition.variant] = await sourceIdentity(
      path.join(sourceRoot, definition.variant === 'before' && paired ? `artifacts/performance/baseline-${session.runId}/workspace` : `artifacts/e2e/${session.runId}/workspace`),
      sourceRoot, definition.variant === 'before' && paired ? baseline.comparison.revision : null);
    await save();
    setupStage = 'synthetic accounts'; const identities = await accounts(session, sourceRoot);
    setupStage = 'browser launch';
    browser = await chromium.launch({ args: ['--no-proxy-server'] }); raw.environment.browser = browser.version();
    const state = {}; setupStage = 'synthetic authentication';
    for (const journey of Object.keys(journeys)) {
      const auth = await browser.newContext({ extraHTTPHeaders: { 'cf-connecting-ip': `2001:db8:${randomBytes(2).toString('hex')}::1` } });
      try {
        const response = await auth.request.post(`${session.apiUrl}/${journey === 'admin' ? 'admin-session/login' : 'auth/login'}`, { data: identities[journey] });
        if (!response.ok()) throw new Error('Synthetic authentication failed.');
        state[journey] = await auth.storageState();
      } finally { await auth.close(); }
    }
    setupStage = 'sampling';
    for (let round = 1; round <= config.rounds; round++) for (const cell of cells) {
      const order = paired && round % 2 === 0 ? [...definitions].reverse() : definitions;
      for (const definition of order) {
        if (raw.interrupted || Date.parse(session.expiresAt) <= Date.now()) throw new Error('Interrupted or expired session.');
        const sample = await capture(browser, state[cell.journey], definition, session, cell, round, output, config);
        raw.samples.push(sample); await save();
        console.log(JSON.stringify({ round, variant: definition.variant, ...cell, metrics: sample.metrics,
          unusedPrefetch: sample.unusedPrefetch.length, counts: sample.counts, failures: sample.failures }));
      }
      await saveSummary(raw, output);
    }
  } catch (error) { raw.fatal = `${setupStage}: capture stopped (${error.name}); see completed samples and declared prerequisites.`; }
  finally { await browser?.close(); raw.finishedAt = new Date().toISOString(); await save(); }
  const summary = await saveSummary(raw, output);
  console.log(JSON.stringify({ output, status: summary.status, samples: summary.actualSamples, expected: summary.expectedSamples }));
  process.exitCode = summary.status === 'FAIL' ? 1 : summary.status === 'INCONCLUSIVE' ? 2 : 0;
}
