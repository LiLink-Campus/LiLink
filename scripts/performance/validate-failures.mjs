import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createSampleBrowser, sampleDocument, sampleClick } from './sample.mjs';
import { readDisposableSession } from './local-session.mjs';
import { readReadiness } from './browser-observers.mjs';

const [sessionPath, outputPath, mode] = process.argv.slice(2);
if (!sessionPath || !outputPath || (mode && mode !== '--clip-only') || process.argv.length > 5) {
  throw new Error('Usage: node scripts/performance/validate-failures.mjs <runner-session.json> <output-directory> [--clip-only]');
}
const session = await readDisposableSession(sessionPath);
const output = path.resolve(outputPath);
await mkdir(output, { recursive: true });
const variant = { webUrl: new URL(session.webUrl).origin, apiOrigin: new URL(session.apiUrl).origin,
  cdnOrigin: session.cdnUrl ? new URL(session.cdnUrl).origin : null, locality: 'loopback', label: session.runId };
const config = { profile: 'unthrottled', motion: 'no-preference', observationMs: 5000,
  output, variants: { after: variant } };
const identity = scenario => ({ round: 0, variant: 'after', viewport: 'desktop', scenario });
const results = { runId: session.runId, mode: mode ? 'clip-only' : 'all-contracts',
  createdAt: new Date().toISOString(), cases: [] };

async function clippedArtwork() {
  const harness = await createSampleBrowser(config, variant, 'desktop');
  const { page, context } = harness;
  const body = await sharp({ create: { width: 128, height: 128, channels: 4,
    background: '#387d83' } }).png().toBuffer();
  let fixture, release, heldPath, heldRequests;
  let held = Promise.resolve();
  await context.route('**/*', async route => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath === '/schools') return route.fulfill({ contentType: 'text/html', body: fixture });
    if (requestPath === heldPath) {
      heldRequests++;
      await held;
      return route.fulfill({ contentType: 'image/png', body }).catch(() => {});
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const cases = [
    ...['hidden', 'clip', 'scroll', 'auto'].map(overflow => ({ name: `below-fold-${overflow}`,
      crop: `top:900px;left:40px;overflow:${overflow}`, image: 'top:-500px;left:0' })),
    { name: 'beside-viewport-x', crop: 'top:200px;left:1400px;overflow-x:hidden;overflow-y:visible',
      image: 'top:0;left:-500px', width: 1600 },
    { name: 'nested-clipped-y', crop: 'top:0;left:40px;overflow:visible', image: 'top:200px;left:0',
      outer: 'position:absolute;top:100px;left:0;width:300px;height:96px;overflow-y:hidden;overflow-x:visible' },
    { name: 'visible-undecoded', crop: 'top:200px;left:40px;overflow:hidden', image: 'top:-500px;left:0', required: true },
    { name: 'started-decode-leaves-viewport', crop: 'top:200px;left:40px;overflow:hidden',
      image: 'top:-500px;left:0', required: true, started: true },
    { name: 'explicit-page-image-below-fold', crop: 'top:900px;left:40px;overflow:hidden',
      image: 'top:-500px;left:0', required: true, pageImage: true },
  ];
  const evidence = { name: 'clipped-first-screen-artwork', passed: false,
    browserVersion: harness.browserVersion, viewport: { width: 1280, height: 800 }, checks: [] };
  results.cases.push(evidence);
  try {
    for (const item of cases) {
      heldRequests = 0;
      held = new Promise(resolve => { release = resolve; });
      heldPath = `/__collector-fixture/${item.name}.png`;
      fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Collector clip contract</title>
        <style>body{margin:0;font:20px sans-serif}h1{margin:24px}#crop{position:absolute;width:96px;height:96px;${item.crop}}
        #atlas{position:absolute;width:${item.width ?? 96}px;height:1600px;${item.image}}</style></head>
        <body><main><h1>来自不同的大学</h1><p>${item.name}</p>
        ${item.outer ? `<div id="outer" style="${item.outer}">` : ''}<div id="crop">
        <img id="atlas" src="${heldPath}" alt="Synthetic atlas crop" ${item.pageImage ? 'data-page-image' : ''}>
        </div>${item.outer ? '</div>' : ''}</main></body></html>`;
      const check = { name: item.name, passed: false, requiredBeforeRelease: !!item.required };
      evidence.checks.push(check);
      try {
        await page.goto('/schools', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__lilinkPerf.paints.some(entry => entry.name === 'first-contentful-paint'));
        assert(heldRequests > 0, 'Native atlas image request must be held.');
        if (item.started) await page.evaluate(() => {
          document.querySelector('#atlas').decode().catch(() => {});
          document.querySelector('#crop').style.top = '900px';
        });
        check.beforeRelease = await page.evaluate(() => ({ complete: document.querySelector('#atlas').complete,
          image: document.querySelector('#atlas').getBoundingClientRect().toJSON(),
          crop: document.querySelector('#crop').getBoundingClientRect().toJSON(),
          outer: document.querySelector('#outer')?.getBoundingClientRect().toJSON() ?? null,
          decodeEvidence: structuredClone(window.__lilinkPerf.imageDecodes) }));
        assert.equal(check.beforeRelease.complete, false, 'Held native image must remain incomplete.');
        if (item.required) {
          const deadline = Date.now() + 350;
          check.blockedObservations = 0;
          while (Date.now() < deadline) {
            assert.equal(await page.evaluate(readReadiness, '/schools'), null,
              'Visible, explicit, or already-started decode must block readiness.');
            check.blockedObservations++;
            await page.waitForTimeout(25);
          }
          if (item.started) assert(check.beforeRelease.decodeEvidence.some(entry => entry.status === 'pending'));
        } else {
          const handle = await page.waitForFunction(readReadiness, '/schools', { polling: 'raf', timeout: 800 });
          check.readyWhileHeld = await handle.jsonValue(); await handle.dispose();
          assert.equal(check.readyWhileHeld.imageCount, 0, 'Cropped-out atlas must not count as first-screen artwork.');
        }
      } catch (error) { check.error = String(error.message).split('\n')[0]; }
      finally {
        // A held native image can delay document.fonts.ready even with no web fonts.
        const screenshot = await harness.cdp.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(output, `clip-${item.name}.png`), Buffer.from(screenshot.data, 'base64'));
        release();
        try {
          await page.waitForFunction(() => document.querySelector('#atlas').complete && document.querySelector('#atlas').naturalWidth > 0);
          const handle = await page.waitForFunction(readReadiness, '/schools', { polling: 'raf', timeout: 2000 });
          check.readyAfterRelease = await handle.jsonValue(); await handle.dispose();
          assert.equal(check.readyAfterRelease.imageCount, item.pageImage || (item.required && !item.started) ? 1 : 0);
        } catch (error) { check.error ??= String(error.message).split('\n')[0]; }
        check.passed = !check.error;
      }
    }
    evidence.passed = evidence.checks.length === cases.length && evidence.checks.every(check => check.passed);
    assert(evidence.passed, 'Clipped first-screen artwork behavior did not satisfy all browser assertions.');
  } finally { release?.(); await harness.browser.close(); }
}

async function pendingArtwork() {
  const harness = await createSampleBrowser(config, variant, 'desktop');
  const { page, context } = harness;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let heldRequests = 0;
  await context.route('**/images/about/watercolor-atlas*', async route => {
    heldRequests++;
    await held;
    await route.abort('failed').catch(() => {});
  });
  try {
    const fallback = (async () => {
      await page.waitForURL('**/about', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('main')?.getAttribute('data-image-ready') === 'true',
        undefined, { timeout: 15_000 });
      await page.getByRole('heading', { name: '关于 LiLink', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => {
        const heading = document.querySelector('main h1');
        if (!heading || heading.getBoundingClientRect().width <= 0) return false;
        for (let node = heading; node instanceof Element; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.visibility !== 'visible' || Number(style.opacity) < 0.99) return false;
        }
        return true;
      });
      const state = await page.evaluate(() => ({ at: performance.now(),
        imageReady: document.querySelector('main')?.getAttribute('data-image-ready'),
        pending: window.__lilinkPerf.imageDecodes.filter(entry => entry.status === 'pending') }));
      // Capture the compositor directly: Playwright waits for fonts that this held preload can block.
      const screenshot = await harness.cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(output, 'pending-artwork-product-fallback.png'), Buffer.from(screenshot.data, 'base64'));
      return state;
    })();
    // Attach a rejection handler immediately while the independent sample awaits its deadline.
    const observedFallback = fallback.then(value => ({ value }), error => ({ error: error.message.split('\n')[0] }));
    const sample = await sampleDocument(harness, config, identity('pending-artwork'), '/about');
    const observation = await observedFallback;
    const evidence = { name: 'pending-artwork', passed: false, heldRequests,
      fallback: observation.value ?? null, observationError: observation.error, sample };
    results.cases.push(evidence);
    assert(heldRequests > 0, 'The actual artwork request must be intercepted.');
    assert(!observation.error, observation.error);
    assert(observation.value.at >= 7500, 'The actual product fallback must run, without faking time.');
    assert(observation.value.pending.length > 0, 'Background decode must remain pending when the product reveals.');
    assert.equal(sample.metrics, null, 'Pending artwork must never produce a successful timing sample.');
    assert(sample.failures.some(message => /Timeout|timeout/.test(message)), 'Collector must reject readiness by its deadline.');
    assert(sample.partialObservation.entries.imageDecodes.some(entry => entry.status === 'pending'));
    evidence.passed = true;
  } finally { release(); await harness.browser.close(); }
}

async function latePrefetchFailure() {
  const harness = await createSampleBrowser(config, variant, 'desktop');
  const { page, context } = harness;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let heldAt = null, abortAt = null, aborted = false;
  let resolveAborted;
  const finishedAbort = new Promise(resolve => { resolveAborted = resolve; });
  await context.route('**/about?*', async route => {
    if (!new URL(route.request().url()).searchParams.has('_rsc') || heldAt !== null) return route.continue();
    heldAt = Date.now();
    await held;
    try { await route.abort('failed'); aborted = true; }
    catch { /* Context shutdown is expected during cleanup only. */ }
    finally { resolveAborted(); }
  });
  await context.route('**/register?*', async route => {
    if (new URL(route.request().url()).searchParams.has('_rsc') && heldAt !== null && abortAt === null) {
      abortAt = Date.now(); release(); await finishedAbort;
    }
    await route.continue();
  });
  try {
    const sample = await sampleClick(harness, config, identity('late-prefetch-failure'), '/register');
    const evidence = { name: 'late-prefetch-failure', passed: false, heldAt, abortAt, sample };
    results.cases.push(evidence);
    assert(heldAt !== null && abortAt !== null && aborted, 'Prefetch must stay pending until the actual registration navigation.');
    assert(sample.metrics?.clickToContentReadyMs > 0, 'Registration must still become normally ready.');
    const clickAt = sample.sourceObservation.timeOrigin + sample.click.time;
    evidence.clickAt = clickAt;
    assert(heldAt < clickAt && abortAt >= Math.floor(clickAt), 'Failure must be injected after the trusted click into an earlier request.');
    const late = sample.validationNetwork.resourceErrors.find(row => row.path === '/about' && row.rsc && row.critical && row.failure);
    assert(late, 'Complete journey ledger must retain the failed pre-click request.');
    assert(late.wallTimeMs < clickAt);
    assert(!sample.network.resources.some(row => row.path === '/about' && row.wallTimeMs < clickAt),
      'Click-stage transfer slicing must remain distinct from the complete error ledger.');
    assert(sample.failures.includes('critical-resource-errors'), 'The collector must not pass a navigation with a late critical failure.');
    assert.equal(sample.targetObservation.timeOrigin, sample.sourceObservation.timeOrigin);
    await page.screenshot({ path: path.join(output, 'registration-visible-with-late-prefetch-failure.png') });
    evidence.passed = true;
  } finally { release(); await harness.browser.close(); }
}

try {
  if (!mode) {
    await pendingArtwork();
    await writeFile(path.join(output, 'failure-contracts.json'), JSON.stringify(results, null, 2));
    await latePrefetchFailure();
  }
  await clippedArtwork();
} catch (error) {
  results.error = error.message;
  process.exitCode = 1;
} finally {
  results.finishedAt = new Date().toISOString();
  results.passed = results.cases.length === (mode ? 1 : 3) && results.cases.every(result => result.passed) && !results.error;
  await writeFile(path.join(output, 'failure-contracts.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.passed, cases: results.cases.map(result => result.name), error: results.error }));
}
