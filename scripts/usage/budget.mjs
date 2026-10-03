import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storageBudget } from "./storage-budget.mjs";

export const METRICS = {
  isrWrites: { label: "ISR Writes", limit: 200_000, unit: "8KB units" },
  isrReads: { label: "ISR Reads", limit: 1_000_000, unit: "8KB units" },
  cdnRequests: { label: "CDN Requests", limit: 1_000_000, unit: "requests" },
  fastDataTransferBytes: { label: "Fast Data Transfer", limit: 100e9, unit: "bytes" },
  fastOriginTransferBytes: { label: "Fast Origin Transfer", limit: 10e9, unit: "bytes" },
  functionInvocations: { label: "Function Invocations", limit: 1_000_000, unit: "invocations" },
  activeCpuHours: { label: "Active CPU", limit: 4, unit: "CPU hours" },
  provisionedMemoryGBHours: { label: "Provisioned Memory", limit: 360, unit: "GB hours" },
  imageTransformations: { label: "Image Transformations", limit: 5_000, unit: "transformations" },
  imageReads: { label: "Image Cache Reads", limit: 300_000, unit: "8KB units" },
  imageWrites: { label: "Image Cache Writes", limit: 100_000, unit: "8KB units" },
  webAnalyticsEvents: { label: "Web Analytics", limit: 50_000, unit: "events" },
  speedInsightsEvents: { label: "Speed Insights", limit: 10_000, unit: "events" },
  buildExecutionMinutes: { label: "Build Execution", limit: 6_000, unit: "minutes" },
};

const keys = Object.keys(METRICS);
const zero = () => Object.fromEntries(keys.map((key) => [key, 0]));
const phases = (input) => ["before", ...(input.intermediate ? ["intermediate"] : []), "after"];
const add = (...values) => values.some((value) => value === null)
  ? null : values.reduce((total, value) => total + value, 0);
const times = (value, multiplier) => value === 0 || multiplier === 0 ? 0
  : value === null || multiplier === null ? null : value * multiplier;

function numeric(value, label, { nullable = false, min = 0, max = Infinity } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number in [${min}, ${max}]${nullable ? " or null" : ""}`);
  }
  return value;
}

function metricMap(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(`${label}.${key} is not a supported metric`);
  }
  return Object.fromEntries(keys.map((key) => [key, numeric(value[key], `${label}.${key}`, { nullable: true })]));
}

function validate(input) {
  if (input.schemaVersion !== 1) throw new Error("schemaVersion must be 1");
  if (input.topology !== "vercel-only" || input.staticCdn !== undefined) {
    throw new Error("This budget requires vercel-only topology without an independent static CDN");
  }
  numeric(input.monthlyPageViews, "monthlyPageViews", { min: 50_000 });
  numeric(input.windowDays, "windowDays", { min: 30, max: 31 });
  numeric(input.targetUtilization, "targetUtilization", { min: 0.01, max: 0.8 });
  numeric(input.uncertaintyMultiplier, "uncertaintyMultiplier", { min: 1 });
  metricMap(input.otherTeamUsage, "otherTeamUsage");
  if (!Array.isArray(input.scenarios) || !input.scenarios.length) throw new Error("scenarios is required");
  if (!input.scenarios.some((scenario) => scenario.coldBrowserFraction === 1 && scenario.requiredForForecast !== false)) {
    throw new Error("At least one all-cold-browser scenario is required");
  }
  if (!input.scenarios.some((scenario) => scenario.coldBrowserFraction === 1
    && scenario.generationsPerInvalidation === 2 && scenario.requiredForForecast !== false)) {
    throw new Error("A required all-cold scenario with two generations per invalidation is required");
  }
  for (const scenario of input.scenarios) {
    if (!scenario.name) throw new Error("Every scenario requires a name");
    numeric(scenario.coldBrowserFraction, `${scenario.name}.coldBrowserFraction`, { max: 1 });
    numeric(scenario.persistentCacheMissFraction, `${scenario.name}.persistentCacheMissFraction`, { max: 1 });
    numeric(scenario.generationsPerInvalidation ?? 1, `${scenario.name}.generationsPerInvalidation`, { min: 1 });
    if (scenario.extraHomeInvalidations !== undefined) numeric(scenario.extraHomeInvalidations, `${scenario.name}.extraHomeInvalidations`);
  }
  for (const phase of phases(input)) {
    const config = input[phase];
    if (!config) throw new Error(`${phase} is required`);
    metricMap(config.coldPerPageView, `${phase}.coldPerPageView`);
    metricMap(config.warmPerPageView, `${phase}.warmPerPageView`);
    metricMap(config.monthlyAdditionalUsage, `${phase}.monthlyAdditionalUsage`);
    if (config.invalidationDelivery) {
      numeric(config.invalidationDelivery.maxAttempts, `${phase}.invalidationDelivery.maxAttempts`, { min: 1 });
      numeric(config.invalidationDelivery.monthlyEvents, `${phase}.invalidationDelivery.monthlyEvents`);
      metricMap(config.invalidationDelivery.perAttempt, `${phase}.invalidationDelivery.perAttempt`);
    }
    numeric(config.analytics.webSampleRate, `${phase}.analytics.webSampleRate`, { max: 1 });
    numeric(config.analytics.speedSampleRate, `${phase}.analytics.speedSampleRate`, { max: 1 });
    numeric(config.analytics.webEventsPerPageView, `${phase}.analytics.webEventsPerPageView`, { nullable: true });
    numeric(config.analytics.speedEventsPerPageView, `${phase}.analytics.speedEventsPerPageView`, { nullable: true });
    if (!Array.isArray(config.isrRoutes)) throw new Error(`${phase}.isrRoutes is required`);
    for (const route of config.isrRoutes) {
      if (!route.name) throw new Error(`${phase}: every ISR route needs a name`);
      numeric(route.monthlyRequests, `${phase}.${route.name}.monthlyRequests`, { nullable: true });
      numeric(route.ttlSeconds, `${phase}.${route.name}.ttlSeconds`, { min: 1 });
      numeric(route.monthlyInvalidations, `${phase}.${route.name}.monthlyInvalidations`, { nullable: true });
      numeric(route.monthlyDeployments, `${phase}.${route.name}.monthlyDeployments`);
      if (phase === "after") {
        numeric(route.invalidationPolicy?.minimumIntervalSeconds, `${phase}.${route.name}.invalidationPolicy.minimumIntervalSeconds`, { min: 1 });
        if (route.invalidationPolicy.persistentRevisionDeduplication !== true) {
          throw new Error(`${phase}.${route.name}: a persistent revision claim is required for the rate-cap forecast`);
        }
      }
      metricMap(route.perRegeneration, `${phase}.${route.name}.perRegeneration`);
      if (route.cacheOutputs) {
        const units = route.cacheOutputs.reduce((sum, output) => sum + Math.ceil(numeric(output.bytes,
          `${phase}.${route.name}.cacheOutputs.${output.name}.bytes`) / 8192), 0);
        if (units !== route.perRegeneration.isrWrites) throw new Error(`${phase}.${route.name}: ISR units must round up each cached output separately`);
      }
    }
  }
}

function project(input, phase, scenario) {
  const config = input[phase];
  const fraction = scenario.coldBrowserFraction;
  const pvs = input.monthlyPageViews;
  const observed = zero();
  const calculated = zero();
  for (const key of keys) {
    observed[key] = times(add(times(config.coldPerPageView[key], fraction), times(config.warmPerPageView[key], 1 - fraction)), pvs);
    if (key === "isrReads" || key === "imageReads") observed[key] = times(observed[key], scenario.persistentCacheMissFraction);
  }
  const regenerations = config.isrRoutes.map((route) => {
    const timeBound = Math.ceil(input.windowDays * 86400 / route.ttlSeconds);
    const extraInvalidations = config.invalidationDelivery && route.name === "home" ? scenario.extraHomeInvalidations ?? 0 : 0;
    const invalidationDemand = add(route.monthlyInvalidations, extraInvalidations);
    const invalidationRateCap = route.invalidationPolicy
      ? Math.ceil(input.windowDays * 86400 / route.invalidationPolicy.minimumIntervalSeconds) + 1 : null;
    const acceptedInvalidations = invalidationDemand === null ? null
      : invalidationRateCap === null ? invalidationDemand : Math.min(invalidationDemand, invalidationRateCap);
    const generationsPerInvalidation = phase === "before" && !route.invalidationPolicy ? 1 : scenario.generationsPerInvalidation ?? 1;
    const scheduleBound = add(timeBound, times(acceptedInvalidations, generationsPerInvalidation), route.monthlyDeployments);
    const count = scheduleBound === null || route.monthlyRequests === null
      ? null : Math.min(route.monthlyRequests, scheduleBound);
    for (const key of keys) calculated[key] = add(calculated[key], times(route.perRegeneration[key], count));
    return { route: route.name, timeBound, scheduleBound, extraInvalidations, acceptedInvalidations,
      invalidationDemand, invalidationRateCap, generationsPerInvalidation, monthlyRequests: route.monthlyRequests, count };
  });
  let notificationAttempts = 0;
  if (config.invalidationDelivery) {
    notificationAttempts = (config.invalidationDelivery.monthlyEvents + (scenario.extraHomeInvalidations ?? 0))
      * config.invalidationDelivery.maxAttempts;
    for (const key of keys) calculated[key] = add(calculated[key], times(config.invalidationDelivery.perAttempt[key], notificationAttempts));
  }
  const analytics = config.analytics;
  calculated.webAnalyticsEvents = add(calculated.webAnalyticsEvents, times(analytics.webEventsPerPageView, pvs * analytics.webSampleRate));
  calculated.speedInsightsEvents = add(calculated.speedInsightsEvents, times(analytics.speedEventsPerPageView, pvs * analytics.speedSampleRate));
  const rows = keys.map((key) => {
    const unadjusted = add(observed[key], calculated[key], config.monthlyAdditionalUsage[key]);
    const projectUsage = times(unadjusted, input.uncertaintyMultiplier);
    const total = add(projectUsage, input.otherTeamUsage[key]);
    const metric = METRICS[key];
    const utilization = total === null ? null : total / metric.limit;
    const projectUtilization = projectUsage === null ? null : projectUsage / metric.limit;
    const forecastUtilization = utilization ?? projectUtilization;
    return {
      key, ...metric,
      browserUsage: observed[key], calculatedUsage: calculated[key],
      monthlyAdditionalUsage: config.monthlyAdditionalUsage[key],
      projectUsage, otherTeamUsage: input.otherTeamUsage[key], total,
      budget: metric.limit * input.targetUtilization,
      utilization, headroom: utilization === null ? null : 1 - utilization,
      projectUtilization, projectHeadroom: projectUtilization === null ? null : 1 - projectUtilization,
      forecastScope: total === null ? "project-only" : "team",
      status: forecastUtilization === null ? "UNKNOWN" : forecastUtilization <= input.targetUtilization ? "PASS" : "FAIL",
      teamStatus: utilization === null ? "UNKNOWN" : utilization <= input.targetUtilization ? "PASS" : "FAIL",
    };
  });
  return { phase, scenario: scenario.name, coldBrowserFraction: fraction,
    persistentCacheMissFraction: scenario.persistentCacheMissFraction,
    requiredForForecast: scenario.requiredForForecast !== false, regenerations, notificationAttempts, rows };
}

export function calculateBudget(input) {
  validate(input);
  const results = input.scenarios.flatMap((scenario) => phases(input).map((phase) => project(input, phase, scenario)));
  const afterRows = results.filter((result) => result.phase === "after" && result.requiredForForecast).flatMap((result) => result.rows);
  const deploymentStorage = storageBudget(input, phases(input));
  const storageAfter = deploymentStorage.rows.filter((row) => row.phase === "after");
  const usageForecastPass = afterRows.every((row) => row.status === "PASS");
  const forecastPass = usageForecastPass && deploymentStorage.forecastPass;
  const teamForecastPass = afterRows.every((row) => row.teamStatus === "PASS") && deploymentStorage.teamForecastPass;
  const evidence = input.evidence ?? {};
  const accountEvidenceComplete = ["browser", "compute", "images", "builds", "storage", "otherTeam", "productionAfter"].every((key) => evidence[key]?.verified === true);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: { monthlyPageViews: input.monthlyPageViews, windowDays: input.windowDays,
      targetUtilization: input.targetUtilization, uncertaintyMultiplier: input.uncertaintyMultiplier },
    topology: input.topology, input, results, deploymentStorage,
    usageForecastPass, forecastPass,
    forecastScope: [...afterRows, ...storageAfter].some((row) => row.forecastScope === "project-only") ? "project-only: other team usage is unknown" : "team",
    teamForecastPass,
    accountVerified: forecastPass && teamForecastPass && accountEvidenceComplete,
    blockers: [
      ...afterRows.filter((row) => row.status !== "PASS").map((row) => `${row.label}: ${row.status}`),
      ...storageAfter.filter((row) => row.status !== "PASS").map((row) => `${row.label}: ${row.status}`),
      ...([...afterRows, ...storageAfter].some((row) => row.teamStatus === "UNKNOWN") ? ["Other team usage is unknown; no account-level capacity claim"] : []),
      ...Object.entries({ browser: "browser observations", compute: "Vercel CPU/memory", images: "image usage", builds: "Vercel build usage", storage: "Vercel retained storage", otherTeam: "other team projects", productionAfter: "post-deployment usage" })
        .filter(([key]) => evidence[key]?.verified !== true).map(([, label]) => `${label}: unverified`),
    ].filter((item, index, items) => items.indexOf(item) === index),
    notes: [
      "This is a forecast conditional on all documented traffic and cost assumptions, not a hard quota or production guarantee.",
      "Cold browser does not mean CDN miss. Persistent ISR/image read costs must use separately documented cache-miss assumptions.",
      "Additional usage must include bots, previews, non-home routes, Sentry tunneling, failures, notifications and resources excluded from browser capture.",
      "Analytics sampling is stochastic; the uncertainty multiplier is an allowance, not a deterministic event cap.",
      "usageForecastPass covers modeled monthly resources only; forecastPass also requires retained deployment and function storage. Neither implies verified account totals.",
    ],
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.log("Usage: node scripts/usage/budget.mjs <scenario.json> [--output <report.json>] [--check-usage | --check-forecast | --check-account]");
    return;
  }
  const inputPath = args.shift();
  let outputPath;
  let check;
  while (args.length) {
    const arg = args.shift();
    if (arg === "--output" && args.length) outputPath = args.shift();
    else if (["--check-usage", "--check-forecast", "--check-account"].includes(arg)) check = arg;
    else throw new Error(`Unknown or incomplete argument: ${arg}`);
  }
  const result = calculateBudget(JSON.parse(await readFile(inputPath, "utf8")));
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json);
    console.log(JSON.stringify({ output: path.resolve(outputPath), usageForecastPass: result.usageForecastPass, forecastPass: result.forecastPass, accountVerified: result.accountVerified, blockers: result.blockers }, null, 2));
  } else console.log(json.trimEnd());
  const passed = check === "--check-account" ? result.accountVerified : check === "--check-usage" ? result.usageForecastPass : result.forecastPass;
  if (check && !passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 2; });
}
