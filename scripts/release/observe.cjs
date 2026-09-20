const { monitorEventLoopDelay } = require('node:perf_hooks');
if (process.argv[1]?.endsWith('/dist/src/main.js')) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let previousCpu = process.cpuUsage();
  setInterval(() => {
    const cpu = process.cpuUsage(previousCpu);
    previousCpu = process.cpuUsage();
    console.log(JSON.stringify({ kind: 'release-performance', time: new Date().toISOString(), rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed, eventLoopP99Ms: delay.percentile(99) / 1e6, eventLoopMaxMs: delay.max / 1e6, cpuUserUs: cpu.user, cpuSystemUs: cpu.system }));
    delay.reset();
  }, 5000).unref();
}
