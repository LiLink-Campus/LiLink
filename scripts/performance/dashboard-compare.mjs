import { chromium } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readComparisonSession } from './local-session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [sessionFile, outputArgument] = process.argv.slice(2);
const inputsOnly = process.argv.includes('--inputs-only');
const quantile = (values, percentile) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * percentile))];
function summarize(raw) {
  const metrics = [];
  for (const viewport of ['desktop', 'mobile']) for (const name of ['inputP75Ms', 'navigationMs']) {
    const pairs = raw.samples.filter(sample => sample.viewport === viewport);
    const before = pairs.map(sample => sample.before[name]);
    const after = pairs.map(sample => sample.after[name]);
    const beforeP75 = quantile(before, .75);
    const afterP75 = quantile(after, .75);
    const toleranceMs = Math.max(20, beforeP75 * .1);
    let state = 147;
    const rng = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
    const deltas = Array.from({ length: 2000 }, () => {
      const resampled = Array.from({ length: pairs.length }, () => pairs[Math.floor(rng() * pairs.length)]);
      return quantile(resampled.map(sample => sample.after[name]), .75) - quantile(resampled.map(sample => sample.before[name]), .75);
    });
    const ci = [quantile(deltas, .025), quantile(deltas, .975)];
    const status = raw.failures.length ? 'FAIL'
      : pairs.length < 10 || !Number.isFinite(beforeP75) || !Number.isFinite(afterP75) ? 'INCONCLUSIVE'
      : ci[0] > toleranceMs ? 'FAIL' : ci[1] > toleranceMs || afterP75 - beforeP75 > toleranceMs ? 'INCONCLUSIVE' : 'PASS';
    metrics.push({ viewport, metric: name, completePairs: pairs.length, beforeP75, afterP75, pairedP75DeltaCi95: ci, toleranceMs, status });
  }
  return { status: metrics.some(metric => metric.status === 'FAIL') ? 'FAIL'
    : raw.ledgers.length !== (raw.measurementScope === 'inputs-only' ? 0 : 4) ? 'INCONCLUSIVE'
    : metrics.some(metric => metric.status !== 'PASS') ? 'INCONCLUSIVE' : 'PASS', metrics,
  ledgers: raw.ledgers.map(ledger => ({ variant: ledger.variant, viewport: ledger.viewport,
    started: ledger.events.filter(event => event.event === 'started').length,
    finished: ledger.events.filter(event => event.event === 'finished').length,
    cancelled: ledger.events.filter(event => event.event === 'cancelled').length,
    failed: ledger.events.filter(event => event.event === 'failed').length,
    hiddenStarted: ledger.events.filter(event => event.event === 'started' && event.phase === 'hidden').length })),
  failures: raw.failures, limitations: ['Simulated visibility and loopback services', 'Custom feedback timings are not INP',
    'Long tasks and DOM writes are diagnostics', 'No production CPU, energy, SQL cancellation or billing claim'] };
}

if (sessionFile === '--summarize') {
  const raw = JSON.parse(await readFile(outputArgument, 'utf8'));
  const result = summarize(raw);
  await writeFile(path.join(path.dirname(outputArgument), 'summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2);
}
if (!sessionFile || !outputArgument) throw new Error('Usage: dashboard-compare.mjs <comparison-session.json> <output-directory>');
const { comparison: session, session: disposable } = await readComparisonSession(sessionFile);
if (!session.active || !session.sharedSyntheticData || Date.parse(session.expiresAt) <= Date.now()) throw new Error('An active shared disposable comparison session is required.');
for (const value of [session.beforeUrl, session.afterUrl, session.apiUrl]) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search) throw new Error('Only credential-free disposable loopback URLs are allowed.');
}
const output = path.resolve(outputArgument);
if (!output.startsWith(`${path.join(root, 'artifacts')}${path.sep}`)) throw new Error('Artifacts must be written inside this workspace artifacts directory.');
await mkdir(output, { recursive: true });
const sourceRoot = path.join(root, 'artifacts/e2e', disposable.runId, 'workspace');
const sourcePaths = [];
async function collectSources(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSources(file);
    else if (entry.isFile()) sourcePaths.push(path.relative(sourceRoot, file));
    else throw new Error('The frozen candidate source must contain regular files.');
  }
}
for (const directory of ['apps/web/src', 'packages/shared/src']) await collectSources(path.join(sourceRoot, directory));
sourcePaths.sort();
const sourceHash = createHash('sha256');
for (const file of sourcePaths) {
  sourceHash.update(file).update(await readFile(path.join(sourceRoot, file)));
}
const raw = { version: 'dashboard-147-v1', baselineRevision: session.revision,
  measurementScope: inputsOnly ? 'inputs-only' : 'full',
  candidateSourceDigest: sourceHash.digest('hex'),
  toolSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  startedAt: new Date().toISOString(), samples: [], ledgers: [], saveResponses: [], failures: [] };
const persist = async () => {
  await writeFile(path.join(output, 'raw.json'), JSON.stringify(raw, null, 2));
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(summarize(raw), null, 2));
};
const browser = await chromium.launch();
raw.browser = browser.version();
const password = 'SyntheticE2e123!';
const email = `${randomUUID()}@school.example.test`;
let cookies;
async function prepareAccount() {
  const context = await browser.newContext();
  try {
    const response = await context.request.post(`${session.apiUrl}/auth/request-code`, { data: { email } });
    if (!response.ok()) throw new Error('Synthetic signup code request failed.');
    let code;
    for (let attempt = 0; attempt < 60 && !code; attempt++) {
      const messages = await (await context.request.get(`${disposable.mailUrl}/api/v1/search`, { params: { query: `to:${email}` } })).json();
      for (const message of messages.messages ?? []) {
        const detail = await (await context.request.get(`${disposable.mailUrl}/api/v1/message/${message.ID}`)).json();
        code = detail.Text?.match(/(?<!\d)\d{6}(?!\d)/)?.[0];
        if (code) break;
      }
      if (!code) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!code) throw new Error('Synthetic SMTP code did not arrive.');
    const registered = await context.request.post(`${session.apiUrl}/auth/register`, { data: { email, code, password, acceptedTerms: true } });
    if (!registered.ok()) throw new Error(`Synthetic signup failed (${registered.status()}).`);
    cookies = await context.cookies();
  } finally { await context.close(); }
}
async function newPage(viewport, token) {
  const context = await browser.newContext({ viewport: viewport === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 },
    reducedMotion: 'no-preference', serviceWorkers: 'block', locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    extraHTTPHeaders: { 'cf-connecting-ip': `2001:db8:147:${token}::1` } });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__dashboardMetrics = { collectingInput: false, inputs: [], inputFrameValid: [], navigation: [], longTasks: [], writes: 0 };
    document.addEventListener('input', event => {
      if (!window.__dashboardMetrics.collectingInput || !event.isTrusted || !event.target.matches('input,textarea')) return;
      const started = performance.now();
      const target = event.target, value = target.value;
      requestAnimationFrame(() => {
        window.__dashboardMetrics.inputFrameValid.push(target === document.activeElement && target.value === value);
        window.__dashboardMetrics.inputs.push(performance.now() - started);
      });
    }, true);
    document.addEventListener('click', event => {
      if (!event.isTrusted || event.target.closest('button')?.textContent !== '下一题 →') return;
      const started = performance.now();
      const current = document.querySelector('[data-reader-hidden="false"]');
      function visible() {
        const selected = document.querySelector('[data-reader-hidden="false"]');
        if (selected && selected !== current && selected.getBoundingClientRect().height > 0) {
          window.__dashboardMetrics.navigation.push(performance.now() - started);
        } else if (performance.now() - started < 3000) requestAnimationFrame(visible);
      }
      requestAnimationFrame(visible);
    }, true);
    new MutationObserver(records => {
      window.__dashboardMetrics.writes += records.filter(record => record.attributeName === 'data-reader-hidden').length;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-reader-hidden'] });
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      new PerformanceObserver(list => window.__dashboardMetrics.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    }
  });
  return { page, context };
}
async function inputSample(variant, viewport, round) {
  const { page, context } = await newPage(viewport, `${round + 1}`);
  let stage = 'profile-load';
  try {
    page.on('response', response => {
      if (new URL(response.url()).pathname === '/api/questionnaire') raw.saveResponses.push({ variant, viewport, round, status: response.status() });
    });
    await page.goto(`${session[variant === 'before' ? 'beforeUrl' : 'afterUrl']}/dashboard/profile`, { waitUntil: 'domcontentloaded' });
    stage = 'directory';
    await page.getByRole('region', { name: '当前题目' }).waitFor({ state: 'visible' });
    const directory = page.getByRole('button', { name: '题目目录', exact: true });
    if (viewport === 'mobile') { await directory.waitFor({ state: 'visible' }); await directory.click(); }
    await page.getByRole('button', { name: /^关于你第 \d+ 题：昵称$/ }).filter({ visible: true }).click();
    stage = 'nickname';
    const name = page.getByRole('textbox', { name: '昵称', exact: true });
    await name.waitFor({ state: 'visible' });
    // The shared account has the preceding variant's final value. Save a common
    // preparation value first so measured edits do not revert to that snapshot.
    stage = 'preparation-save';
    const prepared = page.waitForResponse(response => response.url().endsWith('/api/questionnaire') && response.request().method() === 'PUT' && response.ok());
    await name.fill('配对测量初值');
    await prepared;
    await name.fill('');
    await page.evaluate(() => { window.__dashboardMetrics.collectingInput = true; window.__dashboardMetrics.inputs = []; window.__dashboardMetrics.inputFrameValid = []; window.__dashboardMetrics.longTasks = []; window.__dashboardMetrics.writes = 0; });
    stage = 'measured-save';
    const saved = page.waitForResponse(response => response.url().endsWith('/api/questionnaire') && response.request().method() === 'PUT' && response.ok());
    await name.pressSequentially('固定连续输入验收0123456789', { delay: 25 });
    await saved;
    await page.evaluate(() => { window.__dashboardMetrics.collectingInput = false; });
    if (await name.inputValue() !== '固定连续输入验收0123456789' || !await name.evaluate(element => element === document.activeElement)) throw new Error('Input value or focus was lost.');
    stage = 'navigation';
    await page.getByRole('button', { name: '下一题 →', exact: true }).click();
    await page.getByRole('textbox', { name: /一句话介绍/ }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.__dashboardMetrics.navigation.length > 0);
    const measured = await page.evaluate(() => window.__dashboardMetrics);
    if (measured.inputs.length !== 18) throw new Error('The fixed input sequence must produce exactly 18 measured frames.');
    if (!measured.inputFrameValid.every(Boolean)) throw new Error('The next input frame lost its value or focus.');
    if (round === 0) await page.screenshot({ path: path.join(output, `${variant}-${viewport}-reader.png`),
      mask: [page.locator('input, textarea, select')] });
    return { inputP75Ms: quantile(measured.inputs, .75), navigationMs: measured.navigation[0],
      inputFramesMs: measured.inputs, inputFramesPreservedValueAndFocus: true,
      longTasks: measured.longTasks, readerAttributeWritesDiagnostic: measured.writes };
  } catch (error) {
    throw new Error(`${variant}/${viewport}/round ${round + 1}/${stage}: ${error.name === 'TimeoutError' ? 'timed out' : error.message}`);
  } finally { await context.close(); }
}
async function residency(variant, viewport) {
  const { page, context } = await newPage(viewport, 'a');
  const started = Date.now();
  const events = [];
  const requests = new Map();
  let phase = 'visible';
  const capture = (request, event) => {
    if (!request.url().endsWith('/me/vip')) return;
    if (event === 'started') requests.set(request, requests.size + 1);
    events.push({ id: requests.get(request), event, phase, elapsedMs: Date.now() - started });
  };
  page.on('request', request => capture(request, 'started'));
  page.on('requestfinished', request => capture(request, 'finished'));
  page.on('requestfailed', request => capture(request,
    /abort|cancel/i.test(request.failure()?.errorText ?? '') ? 'cancelled' : 'failed'));
  const hide = async value => page.evaluate(hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
  try {
    await page.goto(`${session[variant === 'before' ? 'beforeUrl' : 'afterUrl']}/dashboard/me`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '用户中心', exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(31_000);
    phase = 'hidden';
    await hide(true);
    await page.waitForTimeout(61_000);
    phase = 'resume';
    await hide(false);
    await page.waitForTimeout(100);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1000);
    phase = 'separate-resume';
    await hide(true);
    await hide(false);
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: '查看权益与激活' }).waitFor({ state: 'visible' });
    if (variant === 'after' && (events.filter(event => event.event === 'started').length !== 3
      || events.some(event => event.event === 'started' && event.phase === 'hidden'))) {
      throw new Error('Candidate residency request behavior did not match its visible/background contract.');
    }
    if (events.some(event => event.event === 'failed')) throw new Error('The residency request failed.');
    await page.screenshot({ path: path.join(output, `${variant}-${viewport}-residency.png`),
      mask: [page.getByRole('region', { name: '账号信息' }).locator('p')] });
    return { variant, viewport, realTime: true, simulatedVisibility: true, events };
  } catch (error) {
    raw.ledgers.push({ variant, viewport, realTime: true, simulatedVisibility: true, complete: false, events });
    throw error;
  } finally { await context.close(); }
}
try {
  await prepareAccount();
  for (const viewport of ['desktop', 'mobile']) {
    for (let round = 0; round < 10; round++) {
      const pair = { viewport, round };
      for (const variant of round % 2 ? ['after', 'before'] : ['before', 'after']) pair[variant] = await inputSample(variant, viewport, round);
      raw.samples.push(pair);
      await persist();
      console.log(`${viewport}: paired sample ${round + 1}/10 complete`);
    }
    for (const variant of inputsOnly ? [] : ['before', 'after']) {
      console.log(`${viewport}: ${variant} real-time residency started (94 seconds)`);
      raw.ledgers.push(await residency(variant, viewport));
      await persist();
    }
  }
} catch (error) { raw.failures.push({ stage: 'collector', message: error.message }); }
finally { await browser.close(); raw.finishedAt = new Date().toISOString(); await persist(); }
const result = summarize(raw);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 2;
