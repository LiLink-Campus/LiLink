import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createSampleBrowser } from './sample.mjs';
import { sampleEarlyClick } from './early-click-sample.mjs';

// Synthetic browser responses exercise visible contracts without changing product data.
export async function validateFirstScreen(config, variant, output) {
  const harness = await createSampleBrowser(config, variant, 'desktop');
  const { page, context } = harness;
  const png = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#edb9ba' } }).png().toBuffer();
  const inline = `data:image/png;base64,${png.toString('base64')}`;
  let releaseHd, releaseScript, fixture, hdWait, scriptWait;
  const evidence = { name: 'independent-first-screen-milestones', passed: false,
    browserVersion: harness.browserVersion, checks: [] };
  await context.route('**/*', async route => {
    const resource = new URL(route.request().url()).pathname;
    if (resource === '/') return route.fulfill({ contentType: 'text/html', body: fixture });
    if (resource === '/about') return route.fulfill({ contentType: 'text/html',
      body: '<!doctype html><html><head><meta charset="utf-8"><title>Native destination</title></head><body><main><h1>关于 LiLink</h1></main></body></html>' });
    if (resource === '/fixture-hd.png') {
      await hdWait;
      return route.fulfill({ contentType: 'image/png', body: png }).catch(() => {});
    }
    if (resource === '/fixture-deferred.js') {
      await scriptWait;
      return route.fulfill({ contentType: 'text/javascript', body: 'window.fixtureScriptExecuted = true;' }).catch(() => {});
    }
    return route.fulfill({ status: 404, body: '' });
  });
  try {
    for (const item of [
      { name: 'preview-before-dcl', preview: true },
      { name: 'baseline-requires-hd', preview: false },
      { name: 'empty-preview-requires-hd', preview: true, empty: true },
      { name: 'hidden-title-blocks-preview', preview: true, hidden: 'h1' },
      { name: 'hidden-control-blocks-preview', preview: true, hidden: 'a[href="/dashboard"]' },
      { name: 'hidden-hd-still-allows-preview', preview: true, hiddenHd: true },
    ]) {
      hdWait = new Promise(resolve => { releaseHd = resolve; });
      scriptWait = new Promise(resolve => { releaseScript = resolve; });
      const check = { name: item.name, passed: false };
      evidence.checks.push(check);
      fixture = `<!doctype html><html><head><meta charset="utf-8"><title>First screen fixture</title>
        <style>body{margin:0;font:20px sans-serif}section{position:relative;height:600px}
        h1,a{position:relative;z-index:2}h1{margin:24px}a{display:inline-block;margin:24px}
        #art{position:absolute;inset:0;background-size:cover;${item.preview && !item.empty ? `background-image:url('${inline}')` : ''}}
        img{width:100%;height:100%;${item.hiddenHd ? 'visibility:hidden' : ''}}
        ${item.hidden ? `${item.hidden}{visibility:hidden}` : ''}</style>
        <script defer src="/fixture-deferred.js"></script></head><body><main>
        <section ${item.preview ? 'data-home-hero' : ''}><h1>让相遇这件事</h1>
        <a href="/dashboard">开始匹配</a><a href="/about">了解更多</a>
        <div id="art" ${item.preview ? 'data-home-preview' : ''}><img data-page-image src="/fixture-hd.png" alt=""></div>
        </section></main></body></html>`;
      try {
        await page.goto('/', { waitUntil: 'commit' });
        await page.waitForFunction(() => document.querySelector('h1'));
        const available = item.preview && !item.empty && !item.hidden;
        if (available) await page.waitForFunction(() => window.__lilinkPerf.firstScreen?.previewVisible);
        else {
          const until = Date.now() + 300;
          while (Date.now() < until) {
            assert.equal(await page.evaluate(() => window.__lilinkPerf.firstScreen?.previewVisible ?? null), null);
            await page.waitForTimeout(30);
          }
        }
        check.held = await page.evaluate(() => ({ readyState: document.readyState,
          milestones: structuredClone(window.__lilinkPerf.firstScreen ?? null),
          scriptExecuted: !!window.fixtureScriptExecuted }));
        assert.equal(check.held.scriptExecuted, false);
        assert.notEqual(check.held.readyState, 'complete');
        assert.equal(check.held.milestones?.heroHdReady ?? null, null);
        if (available) assert(check.held.milestones.previewVisible.at > 0);
        releaseHd();
        await page.waitForFunction(() => document.querySelector('img').complete);
        if (item.hiddenHd) {
          await page.waitForTimeout(150);
          assert.equal(await page.evaluate(() => window.__lilinkPerf.firstScreen.heroHdReady), null);
          await page.locator('img').evaluate(element => element.style.visibility = 'visible');
        }
        if (item.hidden) {
          await page.waitForTimeout(100);
          assert.equal(await page.evaluate(() => window.__lilinkPerf.firstScreen.previewVisible), null);
          await page.locator(item.hidden).evaluate(element => element.style.visibility = 'visible');
        }
        await page.waitForFunction(() => window.__lilinkPerf.firstScreen?.heroHdReady && window.__lilinkPerf.firstScreen.previewVisible);
        check.released = await page.evaluate(() => structuredClone(window.__lilinkPerf.firstScreen));
        if (available) assert(check.released.previewVisible.at < check.released.heroHdReady.at);
        else if (!item.hidden) assert.equal(check.released.previewVisible.artwork, 'hd');
        const screenshot = await harness.cdp.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(output, `first-screen-${item.name}.png`), Buffer.from(screenshot.data, 'base64'));
        check.passed = true;
      } catch (error) { check.error = error.message.split('\n')[0]; }
      finally { releaseHd(); releaseScript(); }
    }
    for (const broken of [false, true]) {
      const check = { name: broken ? 'native-click-retains-real-resource-failure' : 'native-click-before-source-dcl', passed: false };
      evidence.checks.push(check);
      hdWait = new Promise(resolve => { releaseHd = resolve; });
      scriptWait = new Promise(resolve => { releaseScript = resolve; });
      fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Native source</title><style>
        body{font:20px sans-serif}section{position:relative;height:600px}h1,a{position:relative;z-index:2}
        a{display:inline-block;margin:20px}#art{position:absolute;inset:0;background-image:url('${inline}')}
        img{width:100%;height:100%}</style>${broken ? '<script src="/broken.js"></script>' : ''}
        <script defer src="/fixture-deferred.js"></script></head><body><main><section data-home-hero>
        <h1>让相遇这件事</h1><a href="/dashboard">开始匹配</a><a href="/about">了解更多</a>
        <div id="art" data-home-preview><img data-page-image src="/fixture-hd.png" alt=""></div>
        </section></main></body></html>`;
      try {
        check.sample = await sampleEarlyClick(harness, { ...config, clickReadiness: 'preview' },
          { round: 0, variant: 'after', viewport: 'desktop', scenario: check.name }, '/about');
        assert.equal(check.sample.navigationKind, 'document');
        assert(check.sample.metrics.clickToContentReadyMs >= 0);
        assert.equal(check.sample.sourceReady.artwork, 'preview');
        assert.equal(check.sample.sourceObservation.firstScreen.heroHdReady, null);
        assert.notEqual(check.sample.sourceReady.readyState, 'complete');
        if (broken) {
          assert(check.sample.validationNetwork.resourceErrors.some(row => row.path === '/broken.js' && row.critical));
          assert(check.sample.failures.includes('critical-resource-errors'));
        } else assert.deepEqual(check.sample.failures, []);
        check.passed = true;
      } catch (error) { check.error = error.message.split('\n')[0]; }
      finally { releaseHd(); releaseScript(); }
    }
    evidence.passed = evidence.checks.every(check => check.passed);
    return evidence;
  } finally { releaseHd?.(); releaseScript?.(); await harness.browser.close(); }
}
