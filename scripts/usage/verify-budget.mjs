import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const input = JSON.parse(await readFile(path.join(root, "scripts/usage/hobby-50000pv.scenario.json"), "utf8"));
const output = path.resolve(process.argv[2] ?? "artifacts/usage/budget-cli-verification");
await mkdir(output, { recursive: true });

function knownStorage(value) {
  for (const storage of Object.values(value.deploymentStorage)) {
    storage.limitBytes = 10e9;
    storage.otherTeamPeakBytes = 0;
    storage.otherTeamGBMonths = 0;
    for (const phase of ["before", "intermediate", "after"]) {
      storage[phase] = { peakBytes: 2e9, gbMonths: 2 };
    }
  }
}

function underBudgetMonthly(value) {
  value.after.coldPerPageView.cdnRequests = 5;
  value.after.warmPerPageView.cdnRequests = 5;
  value.after.coldPerPageView.imageReads = 0;
}

function knownAffordable(value) { underBudgetMonthly(value); knownStorage(value); }

const scenarios = [
  { name: "vercel-only-risk-is-not-hidden", exit: 1, check: "--check-usage", mutate: () => {},
    assert: (report) => report.usageForecastPass === false && report.staticCdn === undefined
      && report.results.some((r) => r.phase === "after" && r.rows.some((row) => row.key === "cdnRequests" && row.status === "FAIL")) },
  { name: "bounded-replays-remain-transport-cost", exit: 1, check: "--check-usage", mutate: () => {},
    assert: (report) => report.results.some((r) => r.phase === "after" && r.regenerations[0].acceptedInvalidations === 1489
      && r.notificationAttempts === 18600) },
  { name: "two-generation-pressure-is-required", exit: 1, check: "--check-usage", mutate: () => {},
    assert: (report) => report.results.some((r) => r.phase === "after" && r.requiredForForecast
      && r.regenerations[0].generationsPerInvalidation === 2
      && r.rows.some((row) => row.key === "isrWrites" && row.projectUsage === 114220.8 && row.status === "PASS")) },
  { name: "same-current-policy-keeps-identical-generation-pressure", exit: 1, check: "--check-usage",
    mutate: (value) => { value.before = structuredClone(value.after); },
    assert: (report) => report.results.filter((row) => row.scenario === "all-cold-and-two-generations-per-invalidation"
      && ["before", "after"].includes(row.phase)).every((row) => row.regenerations[0].generationsPerInvalidation === 2
      && row.rows.find((metric) => metric.key === "isrWrites").projectUsage === 114220.8) },
  { name: "missing-two-generation-pressure-rejected", exit: 2, check: "--check-usage",
    mutate: (value) => { value.scenarios = value.scenarios.filter((row) => row.generationsPerInvalidation !== 2); } },
  { name: "independent-cdn-input-rejected", exit: 2, check: "--check-usage", mutate: (value) => { value.staticCdn = { provider: "external" }; } },
  { name: "unknown-storage-prevents-full-forecast", exit: 1, check: "--check-forecast",
    mutate: (value) => { value.deploymentStorage.functionsStorage.limitBytes = null; },
    assert: (report) => report.deploymentStorage.rows.some((row) => row.key === "functionsStorage" && row.limitBytes === null) },
  { name: "missing-storage-rejected", exit: 2, check: "--check-forecast",
    mutate: (value) => { delete value.deploymentStorage; } },
  { name: "unknown-gb-months-prevents-full-forecast", exit: 1, check: "--check-forecast",
    mutate: (value) => { knownStorage(value); value.deploymentStorage.functionsStorage.after.gbMonths = null; } },
  { name: "synthetic-known-storage-forecast", exit: 0, check: "--check-forecast", mutate: knownAffordable },
  { name: "storage-overrides-passing-monthly-usage", exit: 1, check: "--check-forecast",
    mutate: (value) => { knownAffordable(value); value.deploymentStorage.deploymentStorage.after.peakBytes = 9e9; },
    assert: (report) => report.usageForecastPass === true && report.forecastPass === false },
  { name: "known-team-storage-overage-cannot-hide-behind-unknown", exit: 1, check: "--check-forecast",
    mutate: (value) => { knownStorage(value); value.deploymentStorage.deploymentStorage.otherTeamPeakBytes = 9e9;
      value.deploymentStorage.deploymentStorage.otherTeamGBMonths = null; },
    assert: (report) => report.deploymentStorage.rows.some((row) => row.phase === "after" && row.key === "deploymentStorage"
      && row.teamStatus === "FAIL" && row.status === "FAIL") },
  { name: "unknown-team-storage-has-account-blocker", exit: 1, check: "--check-account",
    mutate: (value) => { knownAffordable(value);
      for (const key of Object.keys(value.otherTeamUsage)) value.otherTeamUsage[key] = 0;
      for (const evidence of Object.values(value.evidence)) evidence.verified = true;
      value.deploymentStorage.functionsStorage.otherTeamPeakBytes = null;
      value.deploymentStorage.functionsStorage.otherTeamGBMonths = null; },
    assert: (report) => report.accountVerified === false && report.blockers.some((text) => text.includes("Other team usage is unknown")) },
  { name: "unknown-build-minutes", exit: 1, check: "--check-usage",
    mutate: (value) => { value.after.monthlyAdditionalUsage.buildExecutionMinutes = null; } },
  { name: "over-budget-build-minutes", exit: 1, check: "--check-usage",
    mutate: (value) => { value.after.monthlyAdditionalUsage.buildExecutionMinutes = 6000; } },
  { name: "negative-storage-rejected", exit: 2, check: "--check-forecast",
    mutate: (value) => { value.deploymentStorage.deploymentStorage.after.peakBytes = -1; } },
  { name: "unverified-account", exit: 1, check: "--check-account", mutate: () => {} },
  { name: "over-budget-network", exit: 1, check: "--check-usage",
    mutate: (value) => { value.after.coldPerPageView.cdnRequests = 100; } },
  { name: "unknown-cost-is-not-zero", exit: 1, check: "--check-usage",
    mutate: (value) => { value.after.coldPerPageView.activeCpuHours = null; } },
  { name: "negative-cost-rejected", exit: 2, check: "--check-forecast",
    mutate: (value) => { value.after.coldPerPageView.cdnRequests = -1; } },
  { name: "missing-cold-pressure-rejected", exit: 2, check: "--check-forecast",
    mutate: (value) => { value.scenarios = value.scenarios.filter((scenario) => scenario.coldBrowserFraction !== 1); } },
  { name: "separate-output-rounding-rejected", exit: 2, check: "--check-forecast",
    mutate: (value) => { value.after.isrRoutes[0].perRegeneration.isrWrites = 7; } },
];

const results = [];
for (const scenario of scenarios) {
  const value = structuredClone(input);
  delete value.staticCdn;
  value.topology = "vercel-only";
  value.after.isrRoutes[0].invalidationPolicy = { minimumIntervalSeconds: 1800, persistentRevisionDeduplication: true };
  scenario.mutate(value);
  const inputPath = path.join(output, `${scenario.name}.input.json`);
  const outputPath = path.join(output, `${scenario.name}.output.json`);
  await writeFile(inputPath, `${JSON.stringify(value, null, 2)}\n`);
  const result = spawnSync(process.execPath,
    [path.join(root, "scripts/usage/budget.mjs"), inputPath, "--output", outputPath, scenario.check],
    { cwd: root, encoding: "utf8", timeout: 10_000 });
  let assertionPassed = true;
  if (scenario.assert) {
    try { assertionPassed = scenario.assert(JSON.parse(await readFile(outputPath, "utf8"))) === true; }
    catch { assertionPassed = false; }
  }
  const passed = result.status === scenario.exit && assertionPassed;
  results.push({ name: scenario.name, expectedExit: scenario.exit, actualExit: result.status,
    passed, assertionPassed, stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null });
}

const report = { generatedAt: new Date().toISOString(), runtime: process.version,
  environment: "local CLI subprocesses; synthetic scenario files; no network or production data",
  command: "node scripts/usage/verify-budget.mjs", passed: results.every((result) => result.passed), results };
await writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, scenarios: results.map(({ name, passed, actualExit }) => ({ name, passed, actualExit })),
  artifact: path.join(output, "report.json") }, null, 2));
if (!report.passed) process.exitCode = 1;
