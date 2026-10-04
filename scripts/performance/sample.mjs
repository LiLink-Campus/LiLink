import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { installObservers, readReadiness, collectMetrics } from './browser-observers.mjs';
import { observeNetwork } from './network.mjs';
import { browserEnvironment, profiles } from './options.mjs';
import { installFirstScreenObserver } from './first-screen-observer.mjs';

export async function createSampleBrowser(config, variant, viewport) {
  const { env, removed } = browserEnvironment();
  const browser = await chromium.launch({ args: ['--no-proxy-server'], env });
  const context = await browser.newContext({
    ...(viewport === 'mobile' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } }),
    // CDP-created contexts can still inherit macOS proxy settings despite the launch flag.
    ...(config.directContext ? { proxy: { server: 'http://127.0.0.1:9', bypass: '*' } } : {}),
    baseURL: variant.webUrl, locale: 'zh-CN', reducedMotion: config.motion, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const trustedClicks = [];
  await page.exposeBinding('__lilinkPerfTrustedClick', (_, click) => { trustedClicks.push(click); });
  page.setDefaultTimeout(30_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${installObservers.toString()})();(${installFirstScreenObserver.toString()})();`,
  });
  const network = await observeNetwork(cdp, page, variant);
  const profile = profiles[config.profile];
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latencyMs,
    downloadThroughput: profile.downloadMbps ? profile.downloadMbps * 1e6 / 8 : -1,
    uploadThroughput: profile.uploadMbps ? profile.uploadMbps * 1e6 / 8 : -1, connectionType: 'wifi' });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
  return { browser, context, page, cdp, network, trustedClicks,
    browserVersion: browser.version(), proxyEnvironmentNamesRemoved: removed };
}

const errorText = error => String(error?.message ?? error).split('\n')[0].slice(0, 250);
async function waitReady(page, route) {
  const handle = await page.waitForFunction(readReadiness, route, { polling: 'raf', timeout: 30_000 });
  const ready = await handle.jsonValue(); await handle.dispose(); return ready;
}
async function waitObservation(page, config, ready) {
  await page.waitForFunction(({ minimum, readyAt }) => {
    const now = performance.now();
    const lastLcp = window.__lilinkPerf.lcp.at(-1)?.startTime ?? 0;
    return now >= minimum && now - readyAt >= 1000 && now - lastLcp >= 1000;
  }, { minimum: config.observationMs, readyAt: ready.at }, { polling: 'raf', timeout: 30_000 });
}
async function interactionCheck(page, route, viewport, variant, readOnlyPublic = false) {
  const result = {};
  if (route === '/register/school' && !readOnlyPublic) {
    const field = page.getByLabel('学校邮箱', { exact: true });
    await field.evaluate(element => element.addEventListener('input', () => {
      window.__lilinkInputAt = performance.now();
    }, { once: true }));
    await field.fill('performance@school.example.test');
    result.emailInputAccepted = await field.inputValue() === 'performance@school.example.test';
    if (variant.locality === 'loopback') {
      await page.getByText(/✓.*自动化|✓.*验收/).waitFor({ state: 'visible', timeout: 10_000 });
      result.schoolMatchFeedback = true;
      result.emailFeedbackMs = await page.evaluate(() => performance.now() - window.__lilinkInputAt);
    }
    await field.fill('');
  }
  if (viewport === 'mobile') {
    const nativeMenu = page.locator('summary[aria-label="导航菜单"]');
    const usesDetails = await nativeMenu.count() > 0;
    const menu = usesDetails ? nativeMenu : page.getByRole('button', { name: '打开导航菜单', exact: true });
    await menu.evaluate(element => element.addEventListener('click', event => {
      if (event.isTrusted) window.__lilinkMenuClickAt = performance.now();
    }, { once: true }));
    await menu.click();
    const close = usesDetails ? nativeMenu : page.getByRole('button', { name: '关闭导航菜单', exact: true });
    await close.waitFor({ state: 'visible' });
    result.menuOpened = usesDetails ? await close.evaluate(element => element.closest('details')?.open === true)
      : await close.getAttribute('aria-expanded') === 'true';
    if (!result.menuOpened) throw new Error('Mobile navigation did not open.');
    const feedback = await page.waitForFunction(() => {
      const nav = document.querySelector('#public-site-nav');
      if (!nav) return null;
      const box = nav.getBoundingClientRect();
      const style = getComputedStyle(nav);
      if (box.height <= 0 || style.visibility !== 'visible' || Number(style.opacity) < 0.99) return null;
      return performance.now() - window.__lilinkMenuClickAt;
    }, undefined, { polling: 'raf' });
    result.menuFeedbackMs = await feedback.jsonValue(); await feedback.dispose();
    await close.click();
  }
  return result;
}

export async function sampleDocument(harness, config, identity, route) {
  const { page, network } = harness;
  network.reset();
  const result = { ...identity, kind: 'document', route, startedAt: new Date().toISOString(),
    browserVersion: harness.browserVersion, proxyEnvironmentNamesRemoved: harness.proxyEnvironmentNamesRemoved,
    failures: [], metrics: null };
  try {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    result.documentStatus = response?.status();
    if (!response?.ok()) result.failures.push(`document-status-${response?.status()}`);
    const ready = await waitReady(page, route);
    if (route === '/') await page.waitForFunction(() => window.__lilinkPerf.firstScreen?.previewVisible
      && window.__lilinkPerf.firstScreen.heroHdReady, undefined, { polling: 'raf', timeout: 30_000 });
    await waitObservation(page, config, ready);
    const native = await page.evaluate(collectMetrics);
    result.metrics = { fcpMs: native.fcpMs, lcpMs: native.lcpMs, cls: native.cls, ttfbMs: native.ttfbMs,
      contentReadyMs: ready.at };
    if (route === '/') Object.assign(result.metrics, { previewVisibleMs: native.previewVisibleMs,
      heroHdReadyMs: native.heroHdReadyMs });
    result.observation = native; result.ready = ready;
    if (native.visibilityState !== 'visible') result.failures.push('background-tab');
    if (native.fcpMs === null || native.lcpMs === null) result.failures.push('missing-native-paint');
    result.network = network.snapshot();
    // Functional checks and screenshots happen after native timings are frozen.
    result.interaction = await interactionCheck(page, route, identity.viewport, config.variants[identity.variant], config.readOnlyPublic);
    for (const metric of ['emailFeedbackMs', 'menuFeedbackMs']) {
      if (Number.isFinite(result.interaction[metric])) result.metrics[metric] = result.interaction[metric];
    }
    if (identity.round === 1) {
      result.screenshot = `${identity.variant}-${identity.viewport}-${identity.scenario}.png`;
      await page.screenshot({ path: path.join(config.output, result.screenshot) });
    }
  } catch (error) {
    result.failures.push(errorText(error));
    if (!result.observation) result.partialObservation = await page.evaluate(collectMetrics).catch(() => null);
  }
  result.network ??= network.snapshot();
  result.validationNetwork = network.snapshot();
  if (result.validationNetwork.pageErrors.length) result.failures.push('javascript-errors');
  if (result.validationNetwork.resourceErrors.some(row => row.critical)) result.failures.push('critical-resource-errors');
  return result;
}

export async function sampleClick(harness, config, identity, target) {
  const { page, network } = harness;
  network.reset();
  const result = { ...identity, kind: 'click', route: target, startedAt: new Date().toISOString(),
    browserVersion: harness.browserVersion, proxyEnvironmentNamesRemoved: harness.proxyEnvironmentNamesRemoved,
    failures: [], metrics: null };
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const sourceReady = await waitReady(page, '/');
    await waitObservation(page, config, sourceReady);
    result.sourceObservation = await page.evaluate(collectMetrics);
    result.sourceNetwork = network.snapshot();
    const link = page.locator(`main a[href="${target}"]`).first();
    await link.scrollIntoViewIfNeeded();
    // A fixed dwell allows equal opportunities for the product's existing prefetch.
    await page.waitForTimeout(2000);
    result.preClickNetwork = network.snapshot();
    await link.click();
    const ready = await waitReady(page, target);
    const timing = await page.evaluate(targetPath => {
      const click = window.__lilinkPerf.clicks.filter(entry => entry.path === targetPath).at(-1);
      return { click, currentOrigin: performance.timeOrigin };
    }, target);
    if (!timing.click || timing.currentOrigin !== result.sourceObservation.timeOrigin) {
      throw new Error('Expected client transition: trusted source click timing unavailable or document replaced.');
    }
    result.metrics = { clickToContentReadyMs: ready.at - timing.click.time };
    result.ready = ready; result.click = timing.click;
    result.targetObservation = await page.evaluate(collectMetrics);
    result.network = network.snapshot({ sinceWallTimeMs: timing.currentOrigin + timing.click.time });
    result.interaction = await interactionCheck(page, target, identity.viewport, config.variants[identity.variant], config.readOnlyPublic);
    if (Number.isFinite(result.interaction.menuFeedbackMs)) result.metrics.menuFeedbackMs = result.interaction.menuFeedbackMs;
    if (identity.round === 1) {
      result.screenshot = `${identity.variant}-${identity.viewport}-${identity.scenario}.png`;
      await page.screenshot({ path: path.join(config.output, result.screenshot) });
    }
  } catch (error) { result.failures.push(errorText(error)); }
  result.network ??= network.snapshot();
  // The complete journey retains pre-click requests that fail after the click.
  result.validationNetwork = network.snapshot();
  const stages = [result.sourceNetwork, result.preClickNetwork, result.validationNetwork].filter(Boolean);
  if (stages.some(stage => stage.pageErrors.length)) result.failures.push('javascript-errors');
  if (stages.some(stage => stage.resourceErrors.some(row => row.critical))) {
    result.failures.push('critical-resource-errors');
  }
  return result;
}
