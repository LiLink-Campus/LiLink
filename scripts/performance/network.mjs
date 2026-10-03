export async function observeNetwork(cdp, page, variant) {
  await cdp.send('Network.enable');
  let rows = new Map();
  let pageErrors = [];
  const classify = raw => {
    const url = new URL(raw);
    const host = url.origin === variant.webUrl ? 'web' : url.origin === variant.cdnOrigin ? 'cdn'
      : url.origin === variant.apiOrigin ? 'api' : 'external';
    return { host, origin: url.origin, path: url.pathname, rsc: url.searchParams.has('_rsc') };
  };
  cdp.on('Network.requestWillBeSent', event => {
    if (!/^https?:/.test(event.request.url)) return;
    const row = { ...classify(event.request.url), type: event.type, method: event.request.method,
      timestamp: event.timestamp, wallTimeMs: event.wallTime * 1000,
      status: null, transferBytes: 0, fromDiskCache: false, fromMemoryCache: false };
    if (event.redirectResponse) {
      const previous = rows.get(event.requestId);
      if (previous) { previous.status = event.redirectResponse.status; rows.set(`${event.requestId}:${event.timestamp}`, previous); }
    }
    rows.set(event.requestId, row);
  });
  cdp.on('Network.requestServedFromCache', event => {
    const row = rows.get(event.requestId); if (row) row.fromMemoryCache = true;
  });
  cdp.on('Network.responseReceived', event => {
    const row = rows.get(event.requestId);
    if (row) Object.assign(row, { status: event.response.status, fromDiskCache: !!event.response.fromDiskCache,
      fromServiceWorker: !!event.response.fromServiceWorker, protocol: event.response.protocol,
      remotePort: event.response.remotePort,
      remoteAddressFamily: event.response.remoteIPAddress ? (event.response.remoteIPAddress.includes(':') ? 'IPv6' : 'IPv4') : null,
      timing: event.response.timing ?? null });
  });
  cdp.on('Network.responseReceivedExtraInfo', event => {
    const row = rows.get(event.requestId); if (row) row.wireStatus = event.statusCode;
  });
  cdp.on('Network.loadingFinished', event => {
    const row = rows.get(event.requestId);
    if (row) { row.transferBytes = event.encodedDataLength; row.finishedAt = event.timestamp; }
  });
  cdp.on('Network.loadingFailed', event => {
    const row = rows.get(event.requestId);
    if (row) { row.failure = event.errorText; row.canceled = !!event.canceled; }
  });
  page.on('pageerror', error => pageErrors.push({ name: error.name,
    message: error.message.replace(/https?:\/\/[^\s)]+/g, value => {
      try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '[url]'; }
    }).slice(0, 500) }));
  return {
    reset() { rows = new Map(); pageErrors = []; },
    snapshot({ sinceWallTimeMs = -Infinity } = {}) {
      const resources = structuredClone([...rows.values()].filter(row => row.wallTimeMs >= sinceWallTimeMs));
      const errors = resources.filter(row => row.failure || row.status >= 400).map(row => {
        let expected = null;
        const criticalType = ['Document', 'Script', 'Stylesheet', 'Font', 'Image'].includes(row.type);
        if (row.status === 401 && /\/auth\/(me|refresh|session)/.test(row.path)) expected = 'anonymous-auth';
        else if (variant.locality === 'loopback' && row.status === 404 && row.path.startsWith('/_vercel/')) expected = 'local-telemetry-endpoint';
        else if (row.canceled && !criticalType && (!row.status || row.status < 400)) expected = 'browser-canceled';
        const critical = !expected && (row.host !== 'external' || criticalType);
        return { ...row, expected, critical };
      });
      return { resources, resourceErrors: errors, pageErrors: structuredClone(pageErrors),
        transferBytes: resources.reduce((n, row) => n + row.transferBytes, 0) };
    },
  };
}
