// Injected at document start. Measurements never wait for application scripts or DCL.
export function installFirstScreenObserver() {
  const state = { previewVisible: null, heroHdReady: null, previewDecode: null };
  window.__lilinkPerf.firstScreen = state;
  const decoded = new WeakMap();
  const cleanSource = source => {
    try { const url = new URL(source, location.href); return /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : 'inline-image'; }
    catch { return ''; }
  };
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
      const clipLeft = box.left + node.clientLeft * scaleX, clipTop = box.top + node.clientTop * scaleY;
      if (clipsX) { left = Math.max(left, clipLeft); right = Math.min(right, clipLeft + node.clientWidth * scaleX); }
      if (clipsY) { top = Math.max(top, clipTop); bottom = Math.min(bottom, clipTop + node.clientHeight * scaleY); }
      if (left >= right || top >= bottom) return false;
    }
    return true;
  };
  const imageDecoded = image => {
    if (!image?.complete || !image.naturalWidth || !image.currentSrc) return false;
    let record = decoded.get(image);
    if (!record || record.source !== image.currentSrc) {
      record = { source: image.currentSrc, status: 'pending' };
      decoded.set(image, record);
      image.decode().then(() => { record.status = 'decoded'; }, () => { record.status = 'failed'; });
    }
    return record.status === 'decoded' && record.source === image.currentSrc;
  };
  let previewSource = null;
  const previewDecoded = preview => {
    if (!visible(preview)) return false;
    const background = getComputedStyle(preview).backgroundImage;
    const source = background.match(/^url\(["']?(data:image\/[^"')]+)["']?\)$/)?.[1];
    if (!source) return false;
    if (source !== previewSource) {
      previewSource = source;
      const record = { status: 'pending', startedAt: performance.now() };
      state.previewDecode = record;
      const image = new Image();
      image.src = source;
      image.decode().then(() => {
        record.status = 'decoded'; record.finishedAt = performance.now();
      }, () => { record.status = 'failed'; record.finishedAt = performance.now(); });
    }
    return state.previewDecode.status === 'decoded';
  };
  const poll = () => {
    if (location.pathname !== '/') return;
    const main = [...document.querySelectorAll('main')].at(-1);
    const hero = main?.querySelector('[data-home-hero]') ?? main;
    const image = hero?.querySelector('img[data-page-image]');
    const hd = imageDecoded(image) && visible(image);
    const paints = window.__lilinkPerf.paints;
    const painted = paints.some(entry => entry.name === 'first-contentful-paint');
    const stylesLoaded = ![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => !link.disabled
      && (!link.media || matchMedia(link.media).matches) && !link.sheet);
    if (painted && stylesLoaded && hd && !state.heroHdReady) {
      state.heroHdReady = { at: performance.now(), currentSrc: cleanSource(image.currentSrc),
        naturalWidth: image.naturalWidth, readyState: document.readyState };
    }
    const heading = hero?.querySelector('h1');
    const controls = ['/dashboard', '/about'].map(href => hero?.querySelector(`a[href="${href}"]`));
    const semantic = visible(heading) && heading.textContent.includes('让相遇这件事')
      && controls.every(control => visible(control) && !control.closest('[inert]') && !control.matches(':disabled'));
    const preview = hero?.querySelector('[data-home-preview]');
    if (painted && stylesLoaded && semantic && !state.previewVisible) {
      const previewReady = previewDecoded(preview);
      if (previewReady || hd) state.previewVisible = { at: performance.now(), artwork: previewReady ? 'preview' : 'hd',
        heading: heading.textContent.trim(), links: controls.map(control => new URL(control.href).pathname),
        readyState: document.readyState, fonts: document.fonts.status };
    }
    if (!state.previewVisible || !state.heroHdReady) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

export function readPreviewReadiness() {
  if (location.pathname !== '/') return null;
  return window.__lilinkPerf?.firstScreen?.previewVisible ?? null;
}
