// Retained output is separate from request traffic and monthly transfer.
// Both peak retained bytes and normalized GB-months need independent evidence.
const definitions = ["deploymentStorage", "functionsStorage"];

function value(input, label, min = 0) {
  if (input === null) return null;
  if (typeof input !== "number" || !Number.isFinite(input) || input < min) {
    throw new Error(`${label} must be a finite number >= ${min} or null`);
  }
  return input;
}

const add = (a, b) => a === null || b === null ? null : a + b;
const scale = (number, factor) => number === null ? null : number * factor;
function status(peaks, gbMonths, limit, target) {
  if (limit === null) return "UNKNOWN";
  // Known components form a lower bound only; missing values never enable PASS.
  const known = (values) => values.reduce((sum, number) => sum + (number ?? 0), 0);
  if (Math.max(known(peaks), known(gbMonths) * 1e9) > limit * target) return "FAIL";
  return [...peaks, ...gbMonths].includes(null) ? "UNKNOWN" : "PASS";
}

export function storageBudget(input, phases) {
  const config = input.deploymentStorage;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("deploymentStorage must explicitly declare both storage metrics");
  }
  if (Object.keys(config).some((key) => !definitions.includes(key))) throw new Error("Unknown deploymentStorage metric");
  const rows = definitions.flatMap((key) => {
    const metric = config[key];
    if (!metric) throw new Error(`deploymentStorage.${key} is required`);
    const limitBytes = value(metric.limitBytes, `${key}.limitBytes`, 1);
    const otherTeamPeakBytes = value(metric.otherTeamPeakBytes, `${key}.otherTeamPeakBytes`);
    const otherTeamGBMonths = value(metric.otherTeamGBMonths, `${key}.otherTeamGBMonths`);
    return phases.map((phase) => {
      const source = metric[phase];
      if (!source) throw new Error(`${key}.${phase} is required`);
      const peakBytes = value(source.peakBytes, `${key}.${phase}.peakBytes`);
      const gbMonths = value(source.gbMonths, `${key}.${phase}.gbMonths`);
      const projectPeakBytes = scale(peakBytes, input.uncertaintyMultiplier);
      const projectGBMonths = scale(gbMonths, input.uncertaintyMultiplier);
      const teamPeakBytes = add(projectPeakBytes, otherTeamPeakBytes);
      const teamGBMonths = add(projectGBMonths, otherTeamGBMonths);
      const teamStatus = status([projectPeakBytes, otherTeamPeakBytes], [projectGBMonths, otherTeamGBMonths], limitBytes, input.targetUtilization);
      const projectStatus = status([projectPeakBytes], [projectGBMonths], limitBytes, input.targetUtilization);
      return { key, phase, label: metric.label ?? key, limitBytes, limitSource: metric.limitSource ?? null,
        budgetBytes: scale(limitBytes, input.targetUtilization), peakBytes, gbMonths,
        projectPeakBytes, projectGBMonths, otherTeamPeakBytes, otherTeamGBMonths, teamPeakBytes, teamGBMonths,
        forecastScope: teamPeakBytes === null || teamGBMonths === null ? "project-only" : "team",
        status: teamStatus === "UNKNOWN" ? projectStatus : teamStatus, teamStatus };
    });
  });
  const after = rows.filter((row) => row.phase === "after");
  return { rows, forecastPass: after.every((row) => row.status === "PASS"),
    teamForecastPass: after.every((row) => row.teamStatus === "PASS"),
    methodology: "Peak retained bytes bound capacity; GB-months use normalized daily project maxima. Neither is monthly transfer. Unknown allowance or usage prevents a pass." };
}
