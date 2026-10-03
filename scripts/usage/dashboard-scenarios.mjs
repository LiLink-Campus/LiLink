import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { calculateBudget } from './budget.mjs';

const source = 'scripts/usage/hobby-50000pv.scenario.json';
const input = JSON.parse(await readFile(source, 'utf8'));
const directory = 'artifacts/usage/dashboard-scenarios';
await mkdir(directory, { recursive: true });

// These are declared future envelopes informed by rounded historical displays.
const other = structuredClone(input);
for (const key of Object.keys(other.otherTeamUsage)) other.otherTeamUsage[key] = 0;
Object.assign(other.otherTeamUsage, {
  cdnRequests: 5000, fastDataTransferBytes: 20e6, webAnalyticsEvents: 20,
});
other.notes.push('Other-project history directly displayed4KCDN/19.76MBFDT/14Analytics andzero forremaining monthly metrics. This scenario reserves5K/20MB/20events;zeros mean an explicit unchanged-activity assumption,not a verified future bound. Storage remains unknown.');
other.evidence.otherTeam = { verified: false,
  source: 'artifacts/usage/vercel-dashboard-other-project.txt;current historical values observed,future activity remains conditional.' };

const stress = structuredClone(other);
for (const phase of ['before', 'intermediate', 'after']) {
  stress[phase].monthlyAdditionalUsage.buildExecutionMinutes = 127 * 45;
  for (const route of stress[phase].isrRoutes) route.monthlyDeployments = 127;
}
stress.notes.push('Historical127LiLink completed builds at the official45minute per-build maximum produce6858adjusted build minutes. This intentionally fails the4800minute budget;observed old-production aggregate was about2h,not45minutes each.');

const results = [];
for (const [name, scenario] of [['other-project-current-envelope', other], ['127-builds-at-hard-limit', stress]]) {
  const report = calculateBudget(scenario);
  const inputPath = `${directory}/${name}.scenario.json`;
  const reportPath = `${directory}/${name}.json`;
  await writeFile(inputPath, `${JSON.stringify(scenario, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const rows = report.results.find((r) => r.phase === 'after'
    && r.scenario === 'all-cold-browser-and-persistent-cache-miss').rows;
  results.push({ name, input: inputPath, report: reportPath,
    usageForecastPass: report.usageForecastPass, forecastPass: report.forecastPass,
    accountVerified: report.accountVerified,
    metrics: rows.map(({ key, projectUsage, total, headroom, status }) => ({ key, projectUsage, total, headroom, status })) });
}
await writeFile(`${directory}/summary.json`, `${JSON.stringify({ source, results }, null, 2)}\n`);
console.log(JSON.stringify({ output: `${directory}/summary.json`, results: results.map(({ name, usageForecastPass, forecastPass, accountVerified }) => ({ name, usageForecastPass, forecastPass, accountVerified })) }, null, 2));
