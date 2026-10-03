import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Exercise the CLI contract using isolated synthetic inputs, not platform billing.
const root = process.cwd();
const fixture = JSON.parse(await readFile("scripts/usage/isr-write-50000pv.scenario.json", "utf8"));
const output = path.resolve(process.argv[2] ?? "artifacts/usage/isr-write-cli-verification");
await mkdir(output, { recursive: true });
const base = (report) => report.rows.find((row) => row.trafficScenario === "50000-total-pv-30000-home"
  && row.phase === "candidate" && row.processedDeliveriesPerEvent === 1 && row.sensitivity === "base");
const cases = [
  { name: "same-traffic-policy-comparison", exit: 0, args: ["--check-project"],
    assert: (r) => base(r).projectWrites === 74911.2 && base(r).routes[0].acceptedInvalidations === 1489
      && r.rows.some((row) => row.phase === "baseline" && row.trafficScenario === "50000-total-pv-30000-home"
        && row.projectWrites === 804000) },
  { name: "unknown-team-blocks-account", exit: 1, args: ["--check-account"],
    assert: (r) => base(r).teamWrites === null && base(r).teamStatus === "UNKNOWN" && !r.accountPass },
  { name: "known-zero-team-allows-conditional-account", exit: 0, args: ["--check-account"],
    mutate: (x) => { x.otherTeamIsrWrites = 0; }, assert: (r) => r.accountPass === true },
  { name: "known-team-over-budget", exit: 1, args: ["--check-account"],
    mutate: (x) => { x.otherTeamIsrWrites = 100000; }, assert: (r) => base(r).teamStatus === "FAIL" },
  { name: "six-deliveries-share-the-persistent-rate-cap", exit: 0,
    assert: (r) => r.rows.some((row) => row.phase === "candidate" && row.processedDeliveriesPerEvent === 6
      && row.sensitivity === "base" && row.projectWrites === 74911.2 && row.routes[0].callbackAttempts === 18600) },
  { name: "two-generations-pressure-is-required", exit: 0, args: ["--check-project"],
    assert: (r) => r.rows.some((row) => row.phase === "candidate"
      && row.sensitivity === "double-generations-per-invalidation" && row.projectWrites === 114220.8)
      && r.policy.requiredSensitivities.includes("double-generations-per-invalidation") },
  { name: "faster-cap-fails-two-generations-pressure", exit: 1, args: ["--check-project"],
    mutate: (x) => { x.routes[0].invalidationPolicy.minimumIntervalSeconds = 900; } },
  { name: "missing-persistent-cap-rejected", exit: 2,
    mutate: (x) => { delete x.routes[0].invalidationPolicy; } },
  { name: "in-memory-dedupe-cannot-establish-bound", exit: 2,
    mutate: (x) => { x.routes[0].invalidationPolicy.persistentRevisionDeduplication = false; } },
  { name: "each-cache-output-rounds-separately", exit: 0,
    mutate: (x) => { x.routes[0].cacheOutputs = [{ name: "html", bytes: 8192 }, { name: "rsc", bytes: 1 }]; },
    assert: (r) => base(r).routes[0].writeUnitsPerGeneration === 2 && base(r).projectWrites === 17719.2 },
  { name: "exact-80-percent-boundary-passes", exit: 0, args: ["--check-project"],
    mutate: (x) => { x.uncertaintyMultiplier = 1; x.otherProjectIsrReserveUnits = 107574;
      x.routes[0].monthlyStatsEvents = 0; x.routes[0].monthlyUrgentEvents = 0;
      x.routes[0].candidateTtlSeconds = 1275; x.monthlyDeployments = 282; },
    assert: (r) => base(r).projectWrites === 160000 && base(r).projectStatus === "PASS" },
  { name: "one-unit-over-budget-fails", exit: 1, args: ["--check-project"],
    mutate: (x) => { x.uncertaintyMultiplier = 1; x.otherProjectIsrReserveUnits = 107575;
      x.routes[0].monthlyStatsEvents = 0; x.routes[0].monthlyUrgentEvents = 0;
      x.routes[0].candidateTtlSeconds = 1275; x.monthlyDeployments = 282; } },
  { name: "request-cap-applies-only-with-explicit-assumptions", exit: 0,
    mutate: (x) => { x.trafficScenarios[0].monthlyRequestsByRoute.home = 2; },
    assert: (r) => base(r).routes[0].scenarioGenerations === 2 && base(r).projectWrites === 12052.8 },
  { name: "successful-invalidation-threshold", exit: 0,
    assert: (r) => r.thresholds.some((row) => row.route === "home" && row.scope === "project-only"
      && row.maxProcessedInvalidations === 4712 && row.maxUrgentEventsAfterStats === 1736) },
  { name: "negative-event-rejected", exit: 2, mutate: (x) => { x.routes[0].monthlyStatsEvents = -1; } },
  { name: "fractional-request-rejected", exit: 2, mutate: (x) => { x.trafficScenarios[0].monthlyRequestsByRoute.home = 1.5; } },
  { name: "missing-team-cost-is-not-zero", exit: 2, mutate: (x) => { delete x.otherTeamIsrWrites; } },
  { name: "missing-route-request-rejected", exit: 2, mutate: (x) => { delete x.trafficScenarios[0].monthlyRequestsByRoute.home; } },
  { name: "unknown-route-request-rejected", exit: 2, mutate: (x) => { x.trafficScenarios[0].monthlyRequestsByRoute.typo = 1; } },
  { name: "zero-output-rejected", exit: 2, mutate: (x) => { x.routes[0].cacheOutputs[0].bytes = 0; } },
  { name: "duplicate-output-rejected", exit: 2, mutate: (x) => { x.routes[0].cacheOutputs[1].name = "html"; } },
  { name: "duplicate-route-rejected", exit: 2, mutate: (x) => { x.routes.push(structuredClone(x.routes[0])); } },
  { name: "invalid-uncertainty-rejected", exit: 2, mutate: (x) => { x.uncertaintyMultiplier = 0.9; } },
  { name: "unsafe-target-rejected", exit: 2, mutate: (x) => { x.targetUtilization = 0.9; } },
  { name: "ambiguous-cli-checks-rejected", exit: 2, args: ["--check-project", "--check-account"] },
  { name: "lower-html-rsc-size-sensitivity-included", exit: 0,
    mutate: (x) => { x.outputSizeScenarios = structuredClone(fixture.outputSizeScenarios); },
    assert: (r) => r.rows.some((row) => row.outputSizeScenario === "html-rsc-only"
      && row.phase === "candidate" && row.processedDeliveriesPerEvent === 1 && row.sensitivity === "base"
      && row.routes[0].writeUnitsPerGeneration === 12 && row.projectWrites === 46315.2) },
  { name: "local-size-missing-route-rejected", exit: 2,
    mutate: (x) => { x.outputSizeScenarios = structuredClone(fixture.outputSizeScenarios); delete x.outputSizeScenarios[0].cacheOutputsByRoute.home; } },
];

const results = [];
for (const test of cases) {
  const value = structuredClone(fixture);
  value.routes[0].cacheOutputs = structuredClone(fixture.outputSizeScenarios.find((row) => row.name === "complete-local-route-files")?.cacheOutputsByRoute.home
    ?? fixture.routes[0].cacheOutputs);
  value.routes[0].invalidationPolicy = { minimumIntervalSeconds: 1800, persistentRevisionDeduplication: true };
  value.outputSizeScenarios = [];
  test.mutate?.(value);
  const inputPath = path.join(output, `${test.name}.input.json`);
  await writeFile(inputPath, `${JSON.stringify(value, null, 2)}\n`);
  const result = spawnSync(process.execPath, ["scripts/usage/isr-write-budget.mjs", inputPath, ...(test.args ?? [])],
    { cwd: root, encoding: "utf8", timeout: 10000 });
  let assertionPassed = !test.assert;
  let report;
  try { report = JSON.parse(result.stdout); assertionPassed = test.assert ? test.assert(report) === true : true; } catch {}
  if (report) await writeFile(path.join(output, `${test.name}.output.json`), `${JSON.stringify(report, null, 2)}\n`);
  results.push({ name: test.name, expectedExit: test.exit, actualExit: result.status,
    assertionPassed, passed: result.status === test.exit && assertionPassed,
    stderr: result.stderr, error: result.error?.message ?? null });
}
const report = { generatedAt: new Date().toISOString(), runtime: process.version,
  command: `node scripts/usage/verify-isr-write-budget.mjs ${path.relative(root, output)}`,
  environment: "Isolated local CLI subprocesses with synthetic JSON; no network, application server, or database.",
  passed: results.every((result) => result.passed), results };
await writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, cases: results.length, failed: results.filter((r) => !r.passed).map((r) => r.name),
  artifact: path.join(output, "report.json") }, null, 2));
if (!report.passed) process.exitCode = 1;
