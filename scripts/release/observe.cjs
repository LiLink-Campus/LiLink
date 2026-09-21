const { monitorEventLoopDelay } = require('node:perf_hooks');
if (process.argv[1]?.endsWith('/dist/src/main.js')) {
  const { createRequire } = require('node:module');
  const pg = createRequire(`${process.cwd()}/package.json`)('pg');
  const pools = new Set();
  let checkoutMs = [];
  let queryMs = [];
  let checkoutErrors = 0;
  let queryErrors = 0;
  const connect = pg.Pool.prototype.connect;
  pg.Pool.prototype.connect = function (callback) {
    pools.add(this);
    const started = performance.now();
    const record = error => { checkoutMs.push(performance.now() - started); checkoutErrors += Number(Boolean(error)); };
    if (typeof callback === 'function') {
      return connect.call(this, (error, client, release) => { record(error); callback(error, client, release); });
    }
    return connect.call(this).then(client => { record(); return client; }, error => { record(error); throw error; });
  };
  const query = pg.Client.prototype.query;
  pg.Client.prototype.query = function (...args) {
    const started = performance.now();
    const record = error => { queryMs.push(performance.now() - started); queryErrors += Number(Boolean(error)); };
    if (typeof args.at(-1) === 'function') {
      const callback = args.pop();
      return query.call(this, ...args, (error, result) => { record(error); callback(error, result); });
    }
    const result = query.apply(this, args);
    return result?.then ? result.then(value => { record(); return value; }, error => { record(error); throw error; }) : result;
  };
  const summarize = values => {
    values.sort((a, b) => a - b);
    return { count: values.length, p95Ms: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0, maxMs: values.at(-1) ?? 0 };
  };
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let previousCpu = process.cpuUsage();
  setInterval(() => {
    const cpu = process.cpuUsage(previousCpu);
    previousCpu = process.cpuUsage();
    console.log(JSON.stringify({ kind: 'release-performance', time: new Date().toISOString(), rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed, eventLoopP99Ms: delay.percentile(99) / 1e6, eventLoopMaxMs: delay.max / 1e6, cpuUserUs: cpu.user, cpuSystemUs: cpu.system, pools: [...pools].filter(pool => !pool.ended).map(pool => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max })), checkout: { ...summarize(checkoutMs), errors: checkoutErrors }, query: { ...summarize(queryMs), errors: queryErrors } }));
    checkoutMs = []; queryMs = []; checkoutErrors = 0; queryErrors = 0;
    delay.reset();
  }, 5000).unref();
}
