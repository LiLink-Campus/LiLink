// Injected before application JavaScript through CDP on every new document.
export function installObservers() {
  const data = { paints: [], lcp: [], shifts: [], longTasks: [], clicks: [], imageDecodes: [], errors: [] };
  const cleanUrl = value => {
    if (!value) return '';
    try { const url = new URL(value, location.href); return `${url.origin}${url.pathname}`; }
    catch { return ''; }
  };
  const observe = (type, consume) => {
    try {
      new PerformanceObserver(list => list.getEntries().forEach(consume)).observe({ type, buffered: true });
    } catch (error) { data.errors.push(`${type}: ${error.name}`); }
  };
  observe('paint', entry => data.paints.push({ name: entry.name, startTime: entry.startTime }));
  observe('largest-contentful-paint', entry => data.lcp.push({ startTime: entry.startTime,
    renderTime: entry.renderTime, loadTime: entry.loadTime, size: entry.size,
    tag: entry.element?.tagName ?? null, url: cleanUrl(entry.url) }));
  observe('layout-shift', entry => data.shifts.push({ startTime: entry.startTime,
    value: entry.value, hadRecentInput: entry.hadRecentInput }));
  observe('longtask', entry => data.longTasks.push({ startTime: entry.startTime, duration: entry.duration }));
  // Observe the real artwork decoder without initiating extra image requests.
  const nativeDecode = HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode = function (...args) {
    const record = { url: cleanUrl(this.currentSrc || this.src), startedAt: performance.now(), status: 'pending' };
    data.imageDecodes.push(record);
    return nativeDecode.apply(this, args).then(value => {
      record.status = 'decoded'; record.finishedAt = performance.now(); return value;
    }, error => {
      record.status = 'failed'; record.finishedAt = performance.now(); throw error;
    });
  };
  document.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (link && event.isTrusted) data.clicks.push({ time: performance.now(), path: new URL(link.href).pathname });
  }, true);
  document.fonts.ready.then(() => { data.fontsReadyAt = performance.now(); });
  window.__lilinkPerf = data;
}

// Poll only the affected first-screen semantic content. Do not scroll here.
export function readReadiness(route) {
  if (location.pathname !== route) return null;
  const main = [...document.querySelectorAll('main')].at(-1);
  if (!main || main.getAttribute('aria-busy') === 'true' || main.dataset.imageReady === 'false') return null;
  const visible = element => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    if (left >= right || top >= bottom) return false;
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < 0.99) return false;
      if (node === element) continue;
      const clipsX = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX);
      const clipsY = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const box = node.getBoundingClientRect();
      const scaleX = box.width / node.offsetWidth || 1, scaleY = box.height / node.offsetHeight || 1;
      // The client box excludes borders and scrollbars; scale its inset for transformed crops.
      const clipLeft = box.left + node.clientLeft * scaleX, clipTop = box.top + node.clientTop * scaleY;
      if (clipsX) { left = Math.max(left, clipLeft); right = Math.min(right, clipLeft + node.clientWidth * scaleX); }
      if (clipsY) { top = Math.max(top, clipTop); bottom = Math.min(bottom, clipTop + node.clientHeight * scaleY); }
      if (left >= right || top >= bottom) return false;
    }
    return true;
  };
  const heading = main.querySelector('h1');
  const expected = { '/': '让相遇这件事', '/about': '关于 LiLink', '/schools': '来自不同的大学',
    '/register': '加入 LiLink', '/register/school': '验证学校邮箱' }[route];
  if (!visible(heading) || !heading.textContent.includes(expected)) return null;
  if (!window.__lilinkPerf.paints.some(entry => entry.name === 'first-contentful-paint')) return null;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled
    && (!link.media || matchMedia(link.media).matches) && !link.sheet)) return null;
  if (document.fonts.status !== 'loaded') return null;
  const images = [...document.images].filter(image => image.matches('[data-page-image]') || visible(image));
  if (images.some(image => !image.complete || !image.naturalWidth)) return null;
  const states = window.__lilinkDecoded ??= new WeakMap();
  for (const image of images) {
    if (!states.has(image)) {
      states.set(image, 'pending');
      image.decode().then(() => states.set(image, 'decoded'), () => states.set(image, 'failed'));
    }
  }
  if (images.some(image => states.get(image) !== 'decoded')) return null;
  if (window.__lilinkPerf.imageDecodes.some(entry => entry.status !== 'decoded')) return null;
  let control = null;
  if (route === '/') control = main.querySelector('a[href="/about"]');
  if (route === '/register') control = main.querySelector('a[href="/register/school"]');
  if (route === '/register/school') control = main.querySelector('input[type="email"]');
  if (control && (!visible(control) || control.matches(':disabled') || control.closest('[inert]'))) return null;
  if (['/', '/register', '/register/school'].includes(route) && !control) return null;
  return { at: performance.now(), heading: heading.textContent.trim(), imageCount: images.length,
    imageReady: main.dataset.imageReady ?? null, fonts: document.fonts.status,
    decodeEvidence: structuredClone(window.__lilinkPerf.imageDecodes),
    control: control ? { tag: control.tagName, enabled: !control.matches(':disabled') } : null };
}

export function collectMetrics() {
  const data = window.__lilinkPerf;
  const shifts = data.shifts.filter(entry => !entry.hadRecentInput);
  let cls = 0, sum = 0, start = 0, last = 0;
  for (const entry of shifts) {
    if (!sum || entry.startTime - last > 1000 || entry.startTime - start > 5000) {
      sum = entry.value; start = entry.startTime;
    } else sum += entry.value;
    cls = Math.max(cls, sum); last = entry.startTime;
  }
  const nav = performance.getEntriesByType('navigation')[0];
  return { observedUntilMs: performance.now(), timeOrigin: performance.timeOrigin,
    fcpMs: data.paints.find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null,
    lcpMs: data.lcp.at(-1)?.startTime ?? null, cls,
    ttfbMs: nav ? nav.responseStart - nav.startTime : null,
    navigation: nav ? { type: nav.type, domContentLoadedMs: nav.domContentLoadedEventEnd,
      loadMs: nav.loadEventEnd, dnsMs: nav.domainLookupEnd - nav.domainLookupStart,
      connectionMs: nav.connectEnd - nav.connectStart,
      tlsMs: nav.secureConnectionStart ? nav.connectEnd - nav.secureConnectionStart : 0,
      responseMs: nav.responseEnd - nav.responseStart } : null,
    entries: structuredClone(data), visibilityState: document.visibilityState };
}
