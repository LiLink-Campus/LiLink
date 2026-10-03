import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const fail = (message) => { throw new Error(message); };
const round = (value) => Number(value.toFixed(8));

function number(value, label, { min = 0, max = Infinity, integer = false, nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isSafeInteger(value))) fail(`${label} must be ${integer ? "a safe integer" : "a finite number"} in [${min}, ${max}]${nullable ? " or null" : ""}`);
  return value;
}

function namedList(value, label) {
  if (!Array.isArray(value) || !value.length) fail(`${label} must be a nonempty array`);
  const names = new Set();
  for (const item of value) {
    if (!item || typeof item.name !== "string" || !/^[a-zA-Z0-9/_-]+$/.test(item.name) || names.has(item.name)) {
      fail(`${label} must contain unique, nonempty names`);
    }
    names.add(item.name);
  }
  return names;
}

function validate(input) {
  if (input.schemaVersion !== 1) fail("schemaVersion must be 1");
  number(input.monthlyPageViews, "monthlyPageViews", { min: 50000, integer: true });
  number(input.windowDays, "windowDays", { min: 30, max: 31, integer: true });
  number(input.monthlyLimitUnits, "monthlyLimitUnits", { min: 1, integer: true });
  number(input.targetUtilization, "targetUtilization", { min: 0.01, max: 0.8 });
  number(input.uncertaintyMultiplier, "uncertaintyMultiplier", { min: 1 });
  if (input.unitBytes !== 8192) fail("unitBytes must be 8192; other billing conventions need an explicit model revision");
  number(input.monthlyDeployments, "monthlyDeployments", { integer: true });
  number(input.otherProjectIsrReserveUnits, "otherProjectIsrReserveUnits", { integer: true });
  number(input.otherTeamIsrWrites, "otherTeamIsrWrites", { integer: true, nullable: true });
  if (!Array.isArray(input.processedDeliveriesPerEvent) || ![1, 2, 3, 6].every((n) => input.processedDeliveriesPerEvent.includes(n))
    || new Set(input.processedDeliveriesPerEvent).size !== input.processedDeliveriesPerEvent.length) {
    fail("processedDeliveriesPerEvent must include 1, 2, 3, 6 exactly once each");
  }
  for (const value of input.processedDeliveriesPerEvent) number(value, "processedDeliveriesPerEvent", { min: 1, max: 6, integer: true });
  const names = namedList(input.routes, "routes");
  for (const route of input.routes) {
    for (const field of ["baselineTtlSeconds", "candidateTtlSeconds", "generationsPerInvalidation"]) {
      number(route[field], `${route.name}.${field}`, { min: 1, integer: true });
    }
    for (const field of ["monthlyStatsEvents", "monthlyUrgentEvents"]) number(route[field], `${route.name}.${field}`, { integer: true });
    number(route.invalidationPolicy?.minimumIntervalSeconds, `${route.name}.invalidationPolicy.minimumIntervalSeconds`, { min: 1, integer: true });
    if (route.invalidationPolicy.persistentRevisionDeduplication !== true) {
      fail(`${route.name}: the invalidation bound requires persistent revision deduplication across all receivers`);
    }
    namedList(route.cacheOutputs, `${route.name}.cacheOutputs`);
    for (const output of route.cacheOutputs) number(output.bytes, `${route.name}.${output.name}.bytes`, { min: 1, integer: true });
    if (typeof route.outputBytesBasis !== "string" || !route.outputBytesBasis.trim()) fail(`${route.name}.outputBytesBasis is required`);
  }
  if (input.outputSizeScenarios !== undefined && !Array.isArray(input.outputSizeScenarios)) fail("outputSizeScenarios must be an array");
  if (input.outputSizeScenarios?.length) namedList(input.outputSizeScenarios, "outputSizeScenarios");
  for (const size of input.outputSizeScenarios ?? []) {
    if (size.name === "route-output-default") fail("route-output-default is the reserved base size scenario name");
    if (!size.cacheOutputsByRoute || typeof size.cacheOutputsByRoute !== "object") fail(`${size.name}.cacheOutputsByRoute is required`);
    for (const name of names) {
      namedList(size.cacheOutputsByRoute[name], `${size.name}.${name}.cacheOutputs`);
      for (const output of size.cacheOutputsByRoute[name]) number(output.bytes, `${size.name}.${name}.${output.name}.bytes`, { min: 1, integer: true });
    }
    for (const name of Object.keys(size.cacheOutputsByRoute)) if (!names.has(name)) fail(`${size.name}: unknown route ${name}`);
    if (typeof size.outputBytesBasis !== "string" || !size.outputBytesBasis.trim()) fail(`${size.name}.outputBytesBasis is required`);
  }
  namedList(input.trafficScenarios, "trafficScenarios");
  for (const scenario of input.trafficScenarios) {
    const requests = scenario.monthlyRequestsByRoute;
    if (!requests || typeof requests !== "object" || Array.isArray(requests)) fail(`${scenario.name}.monthlyRequestsByRoute is required`);
    for (const name of names) number(requests[name], `${scenario.name}.${name}.monthlyRequests`, { integer: true });
    for (const name of Object.keys(requests)) if (!names.has(name)) fail(`${scenario.name}: unknown route ${name}`);
    if (typeof scenario.assumption !== "string" || !scenario.assumption.trim()) fail(`${scenario.name}.assumption is required`);
  }
}

function routeUsage(input, traffic, route, phase, delivery, sensitivity) {
  const ttlSeconds = phase === "baseline" ? route.baselineTtlSeconds : route.candidateTtlSeconds;
  const timeOpportunities = Math.ceil(input.windowDays * 86400 / ttlSeconds);
  const events = phase === "baseline" ? 0 : (route.monthlyStatsEvents + route.monthlyUrgentEvents) * sensitivity.events;
  const callbackAttempts = events * delivery;
  const rateCap = Math.ceil(input.windowDays * 86400 / route.invalidationPolicy.minimumIntervalSeconds) + 1;
  const acceptedInvalidations = Math.min(events, rateCap);
  const generationsPerInvalidation = route.generationsPerInvalidation * sensitivity.generations;
  const scheduleOpportunities = timeOpportunities + input.monthlyDeployments + acceptedInvalidations * generationsPerInvalidation;
  const monthlyRequests = traffic.monthlyRequestsByRoute[route.name];
  const scenarioGenerations = Math.min(monthlyRequests, scheduleOpportunities);
  const cacheOutputs = route.cacheOutputs.map((output) => ({ ...output, units: Math.ceil(output.bytes / input.unitBytes) }));
  const sourceUnits = cacheOutputs.reduce((sum, output) => sum + output.units, 0);
  const writeUnitsPerGeneration = sourceUnits * sensitivity.units;
  return { name: route.name, ttlSeconds, monthlyRequests, timeOpportunities, monthlyDeployments: input.monthlyDeployments,
    businessEvents: events, callbackAttempts, acceptedInvalidations, invalidationRateCap: rateCap,
    invalidationPolicy: route.invalidationPolicy, generationsPerInvalidation, scheduleOpportunities, scenarioGenerations,
    cacheOutputs, writeUnitMultiplier: sensitivity.units, writeUnitsPerGeneration,
    routeWriteUnits: scenarioGenerations * writeUnitsPerGeneration, outputBytesBasis: route.outputBytesBasis };
}

const sensitivities = [
  { name: "base", units: 1, events: 1, generations: 1 },
  { name: "double-write-units", units: 2, events: 1, generations: 1 },
  { name: "double-business-events", units: 1, events: 2, generations: 1 },
  { name: "double-write-units-and-events", units: 2, events: 2, generations: 1 },
  { name: "double-generations-per-invalidation", units: 1, events: 1, generations: 2 },
];

function row(input, traffic, phase, delivery, sensitivity) {
  const routes = input.routes.map((route) => routeUsage(input, traffic, route, phase, delivery, sensitivity));
  const unadjustedWrites = routes.reduce((sum, item) => sum + item.routeWriteUnits, input.otherProjectIsrReserveUnits);
  const projectWrites = round(unadjustedWrites * input.uncertaintyMultiplier);
  const teamWrites = input.otherTeamIsrWrites === null ? null : round(projectWrites + input.otherTeamIsrWrites);
  const budget = input.monthlyLimitUnits * input.targetUtilization;
  return { trafficScenario: traffic.name, phase, sensitivity: sensitivity.name, processedDeliveriesPerEvent: delivery,
    routes, reserveUnits: input.otherProjectIsrReserveUnits, unadjustedWrites, projectWrites, teamWrites, budget,
    projectHeadroom: round(1 - projectWrites / input.monthlyLimitUnits),
    teamHeadroom: teamWrites === null ? null : round(1 - teamWrites / input.monthlyLimitUnits),
    projectStatus: projectWrites <= budget ? "PASS" : "FAIL",
    teamStatus: teamWrites === null ? (projectWrites > budget ? "FAIL" : "UNKNOWN") : teamWrites <= budget ? "PASS" : "FAIL",
    scope: teamWrites === null ? "project-only" : "conditional-team" };
}

function threshold(input, traffic, route, allRoutes, unitMultiplier, generationMultiplier, otherTeam) {
  const source = allRoutes.find((item) => item.name === route.name);
  const otherRouteUnits = allRoutes.filter((item) => item.name !== route.name).reduce((sum, item) => sum + item.routeWriteUnits, 0);
  const availableUnits = (input.monthlyLimitUnits * input.targetUtilization - otherTeam) / input.uncertaintyMultiplier
    - input.otherProjectIsrReserveUnits - otherRouteUnits;
  const units = source.writeUnitsPerGeneration * unitMultiplier;
  const maxBudgetedGenerations = Math.floor(availableUnits / units);
  const baseOpportunities = source.timeOpportunities + input.monthlyDeployments;
  const generationsPerInvalidation = route.generationsPerInvalidation * generationMultiplier;
  const maxProcessedInvalidations = Math.max(-1, Math.floor((maxBudgetedGenerations - baseOpportunities) / generationsPerInvalidation));
  const maxUrgentEventsAfterStats = Math.max(-1, maxProcessedInvalidations - route.monthlyStatsEvents);
  return { trafficScenario: traffic.name, route: route.name, scope: input.otherTeamIsrWrites === null ? "project-only" : "conditional-team",
    writeUnitsPerGeneration: units, generationsPerInvalidation, otherRoutesHeldAtBaseWriteUnits: otherRouteUnits,
    maxBudgetedGenerations, maxProcessedInvalidations, maxUrgentEventsAfterStats,
    maxUrgentEventsPerDayAfterStats: maxUrgentEventsAfterStats < 0 ? null : round(maxUrgentEventsAfterStats / input.windowDays),
    condition: "Uncapped capacity threshold: each processed invalidation causes the specified changed generations; other routes stay at the base forecast. One processed delivery per business event. -1 means even the fixed baseline has no budget. Request caps are deliberately not used to make an unlimited-event claim." };
}

function calculate(input) {
  validate(input);
  const rows = [];
  const thresholds = [];
  const sizes = [{ name: "route-output-default", routes: input.routes }, ...(input.outputSizeScenarios ?? []).map((size) => ({
    name: size.name, routes: input.routes.map((route) => ({ ...route,
      cacheOutputs: size.cacheOutputsByRoute[route.name], outputBytesBasis: size.outputBytesBasis })),
  }))];
  for (const size of sizes) for (const traffic of input.trafficScenarios) {
    const variant = { ...input, routes: size.routes };
    const addRow = (phase, delivery, sensitivity) => ({ ...row(variant, traffic, phase, delivery, sensitivity), outputSizeScenario: size.name });
    rows.push(addRow("baseline", 0, sensitivities[0]));
    for (const delivery of input.processedDeliveriesPerEvent) rows.push(addRow("candidate", delivery, sensitivities[0]));
    for (const sensitivity of sensitivities.slice(1)) rows.push(addRow("candidate", 1, sensitivity));
    const base = addRow("candidate", 1, sensitivities[0]);
    for (const route of size.routes) for (const units of [1, 2]) for (const generations of [1, 2]) {
      thresholds.push({ ...threshold(variant, traffic, route, base.routes, units, generations, input.otherTeamIsrWrites ?? 0), outputSizeScenario: size.name });
    }
  }
  const requiredSensitivities = ["base", "double-generations-per-invalidation"];
  const plannedRows = rows.filter((item) => item.phase === "candidate" && item.processedDeliveriesPerEvent === 1
    && requiredSensitivities.includes(item.sensitivity));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), input,
    formula: "acceptedInvalidations = min(business events, ceil(window seconds / persistent per-scope minimum interval) + 1); callbackAttempts = business events * transport deliveries; persistent revision deduplication prevents replay multiplication; scenarioGenerations = min(explicit route requests, ceil(window seconds / TTL) + deployments + acceptedInvalidations * generations per invalidation); projectWrites = (sum(route generations * sum(ceil(each output bytes / 8192))) + reserve) * uncertainty; teamWrites = projectWrites + known other-team writes",
    policy: { limitUnits: input.monthlyLimitUnits, budgetUnits: input.monthlyLimitUnits * input.targetUtilization,
      monthlyPageViews: input.monthlyPageViews, uncertaintyMultiplier: input.uncertaintyMultiplier, requiredSensitivities },
    rows, thresholds, projectPass: plannedRows.every((item) => item.projectStatus === "PASS"),
    accountPass: plannedRows.every((item) => item.teamStatus === "PASS"),
    billingVerified: false,
    blockers: input.otherTeamIsrWrites === null ? ["Other team future ISR Writes is unknown; project-only forecast."] : [],
    boundary: "Conditional planning arithmetic only, not a platform upper bound or production bill. Check flags require base and two-generations-per-invalidation rows. Persistent API per-scope receipt gating and revision deduplication must be verified end to end; traffic caps, output sizes and deployment allowances are separate assumptions. accountPass means known-input arithmetic, not verified production capacity.",
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0] === "--help") {
    console.log("Usage: node scripts/usage/isr-write-budget.mjs <scenario.json> [--output <report.json>] [--check-project | --check-account]");
    return;
  }
  const inputPath = args.shift();
  let output;
  let check;
  while (args.length) {
    const arg = args.shift();
    if (arg === "--output" && !output && args[0] && !args[0].startsWith("--")) output = args.shift();
    else if (["--check-project", "--check-account"].includes(arg) && !check) check = arg;
    else fail(`Unknown, duplicate, or incomplete argument: ${arg}`);
  }
  const report = calculate(JSON.parse(await readFile(inputPath, "utf8")));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await writeFile(output, json);
    console.log(JSON.stringify({ output: path.resolve(output), projectPass: report.projectPass, accountPass: report.accountPass, blockers: report.blockers }, null, 2));
  } else process.stdout.write(json);
  if (check && !(check === "--check-project" ? report.projectPass : report.accountPass)) process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 2; });
