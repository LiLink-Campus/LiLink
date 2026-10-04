import path from 'node:path';
import { readReadiness } from './browser-observers.mjs';
import { readPreviewReadiness } from './first-screen-observer.mjs';

const waitReady = async (page, route) => {
  const handle = await page.waitForFunction(readReadiness, route, { polling: 'raf', timeout: 30_000 });
  const value = await handle.jsonValue(); await handle.dispose(); return value;
};
const observation = page => page.evaluate(() => ({ timeOrigin: performance.timeOrigin, at: performance.now(),
  visibility: document.visibilityState, imageDecodes: structuredClone(window.__lilinkPerf.imageDecodes),
  firstScreen: structuredClone(window.__lilinkPerf.firstScreen ?? null),
  trustedClicks: structuredClone(window.__lilinkPerf.clicks) }));

export async function sampleEarlyClick(harness, config, identity, target) {
  const { page, network, trustedClicks } = harness;
  network.reset();
  const result = { ...identity, kind: 'click', route: target, browserVersion: harness.browserVersion,
    proxyEnvironmentNamesRemoved: harness.proxyEnvironmentNamesRemoved, failures: [], metrics: null };
  try {
    const response = await page.goto('/', { waitUntil: 'commit', timeout: 30_000 });
    if (!response?.ok()) throw new Error(`Source document status ${response?.status()}`);
    if (config.clickReadiness === 'preview') {
      const handle = await page.waitForFunction(readPreviewReadiness, undefined, { polling: 'raf', timeout: 30_000 });
      result.sourceReady = await handle.jsonValue(); await handle.dispose();
    } else result.sourceReady = await waitReady(page, '/');
    result.sourceObservation = await observation(page);
    const link = page.locator(`main a[href="${target}"]`).first();
    await link.scrollIntoViewIfNeeded();
    result.preClickNetwork = network.snapshot();
    await link.click();
    result.ready = await waitReady(page, target);
    result.targetObservation = await observation(page);
    const click = trustedClicks.filter(value => value.path === target
      && value.timeOrigin === result.sourceObservation.timeOrigin).at(-1);
    if (!click) throw new Error('Trusted source click timing is unavailable.');
    result.click = click;
    result.navigationKind = result.sourceObservation.timeOrigin === result.targetObservation.timeOrigin ? 'client' : 'document';
    result.sourceReadyToClickMs = click.time - result.sourceReady.at;
    const elapsed = result.targetObservation.timeOrigin + result.ready.at - (click.timeOrigin + click.time);
    if (!(elapsed >= 0)) throw new Error('Target readiness must follow the trusted source click.');
    result.metrics = { clickToContentReadyMs: elapsed };
    result.clickNetwork = network.snapshot({ sinceWallTimeMs: result.sourceObservation.timeOrigin + click.time });
    if (identity.round === 1) {
      result.screenshot = `${identity.variant}-${identity.viewport}-${identity.scenario}.png`;
      await page.screenshot({ path: path.join(config.output, result.screenshot) });
    }
  } catch (error) {
    result.failures.push(error.message.split('\n')[0].slice(0, 250));
    result.partialObservation = await observation(page).catch(() => null);
  }
  result.validationNetwork = network.snapshot();
  if (result.navigationKind === 'document' && result.click && result.ready) {
    const sourceDocument = result.preClickNetwork.resources.find(row => row.type === 'Document' && row.path === '/');
    const clickAt = result.click.timeOrigin + result.click.time;
    const targetDocument = result.validationNetwork.resources.find(row => row.type === 'Document'
      && row.path === target && row.wallTimeMs >= clickAt && row.status >= 200 && row.status < 400);
    if (sourceDocument?.loaderId && targetDocument?.loaderId && sourceDocument.loaderId !== targetDocument.loaderId) {
      for (const error of result.validationNetwork.resourceErrors) {
        if (error.loaderId === sourceDocument.loaderId && error.canceled && error.failure === 'net::ERR_ABORTED'
          && error.failureWallTimeMs >= clickAt && (!error.status || error.status < 400)) {
          error.expected = 'source-document-navigation-canceled'; error.critical = false;
        }
      }
    }
  }
  if (result.validationNetwork.pageErrors.length) result.failures.push('javascript-errors');
  if (result.validationNetwork.resourceErrors.some(resource => resource.critical)) result.failures.push('critical-resource-errors');
  return result;
}

