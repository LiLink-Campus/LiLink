import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { check, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const target = JSON.parse(open(__ENV.TARGET_FILE));
const secret = open(__ENV.ACCESS_FILE).trim();
const fixture = JSON.parse(open(__ENV.QUESTION_FIXTURE));
if (!['https://release-api-20260920.lilink.top', 'http://127.0.0.1:4080'].includes(target.baseUrl) || target.branchId !== 'br-muddy-poetry-azax6deb' || target.projectId !== 'patient-meadow-65557384' || !__ENV.RELEASE_SHA) throw new Error('Verified isolated target and exact release SHA are required.');
const rate = Number(__ENV.LOAD_RATE || 33);
const seconds = Number(__ENV.LOAD_DURATION_SECONDS || 120);
const mode = __ENV.MODE || 'read';
if (!['read', 'mixed', 'home', 'match'].includes(mode)) throw new Error('Unknown load mode.');
const mixed = mode === 'mixed';
const timeUnit = __ENV.RATE_TIME_UNIT || '1s';
const measuredReadRoutes = mode === 'match' ? ['/me/bootstrap'] : ['/me/bootstrap', '/me/questionnaire', '/me/contact-preferences', '/questionnaire/current'];
if (!['1s', '1m'].includes(timeUnit)) throw new Error('RATE_TIME_UNIT must be 1s or 1m.');
const expectedIterations = Math.floor(rate * seconds / (timeUnit === '1m' ? 60 : 1));
const expectedRequests = mode === 'home' ? expectedIterations * 4 : mixed
  ? expectedIterations + Math.floor(expectedIterations / 10) * 3 + Math.max(0, expectedIterations % 10 - 7)
  : expectedIterations;
if (!Number.isInteger(rate) || rate < 1 || !Number.isInteger(seconds) || seconds < 1 || seconds > 1800 || expectedIterations < 1 || expectedRequests / seconds > 200) throw new Error('Invalid or oversized load schedule.');
const failures = new Rate('business_failures');
const successfulUsers = new Counter('first_pass_successful_fixture_users');
const attemptedRequests = new Counter('attempted_api_requests');
const successfulRequests = new Counter('successful_api_requests');
const flowDuration = new Trend('complete_api_flow_ms', true);
const complete = new Counter('completed_business_iterations');
const reads = new Trend('business_read_ms', true);
const writes = new Trend('business_write_ms', true);
const limited = new Counter('unexpected_429');
export const options = {
  scenarios: { release: { executor: 'constant-arrival-rate', rate, timeUnit, duration: `${seconds}s`, preAllocatedVUs: 250, maxVUs: 500, gracefulStop: '30s' } },
  thresholds: {
    dropped_iterations: ['count==0'], business_failures: ['rate<0.005'], unexpected_429: ['count==0'],
    business_read_ms: ['p(95)<=800', 'p(99)<=2000'],
    ...Object.fromEntries(measuredReadRoutes.map(route => [`business_read_ms{route:${route}}`, ['p(95)<=800', 'p(99)<=2000']])),
    ...(mixed ? { business_write_ms: ['p(95)<=1500'] } : {}),
    ...(['home', 'match'].includes(mode) ? { complete_api_flow_ms: ['p(95)<=3000'] } : {}),
    attempted_api_requests: [`count>=${Math.ceil(expectedRequests * 0.995)}`],
    successful_api_requests: [`count>=${Math.ceil(expectedRequests * 0.995)}`],
    completed_business_iterations: [`count>=${Math.ceil(expectedIterations * 0.995)}`],
    first_pass_successful_fixture_users: [`count>=${Math.ceil(Math.min(2000, expectedIterations) * 0.995)}`],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(95)', 'p(99)'],
};
function jwt(userId) {
  const header = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl');
  const payload = encoding.b64encode(JSON.stringify({ sub: userId, email: `${userId}@release.example.test`, exp: Math.floor(Date.now() / 1000) + 7200 }), 'rawurl');
  return `${header}.${payload}.${crypto.hmac('sha256', secret, `${header}.${payload}`, 'base64rawurl')}`;
}
export function setup() {
  const response = http.get(`${target.baseUrl}/__release`, { headers: { 'x-release-access': secret } });
  if (response.status !== 200) fail('Release identity endpoint unavailable.');
  const identity = response.json();
  if (identity.branchId !== target.branchId || identity.projectId !== target.projectId || identity.release !== __ENV.RELEASE_SHA || identity.synthetic !== true || identity.users !== 2000) fail('Release identity mismatch.');
  return { answers: Object.fromEntries(fixture.questions.map(q => [q.key, q.type === 'MULTI_SELECT' ? q.options.slice(0, q.selectionLimit || 1).map(o => o.value) : q.options[0].value])) };
}
export default function(data) {
  limited.add(0);
  const iteration = exec.scenario.iterationInTest;
  const n = iteration % 2000;
  const userId = `release_user_${String(n).padStart(4, '0')}`;
  const headers = { 'x-release-access': secret, Cookie: `lilink_rehearsal_token=${jwt(userId)}`, 'Content-Type': 'application/json' };
  const form = { birthYear: '2000', birthMonth: '1', birthDay: '1', gender: n % 2 ? '男' : '女', partnerGenders: ['男','女'], partnerAgeMin: '18', partnerAgeMax: '40', nationality: '中国', languages: ['中文'], partnerNationalities: [], partnerLanguages: [], looks: '5', partnerLooks: ['1','2','3','4','5','6','7','8','9','10'], heightCm: '165', weightKg: '55', partnerHeightMin: '120', partnerHeightMax: '230', partnerWeightMin: '30', partnerWeightMax: '300', oneLinerIntro: `合成用户 ${n} 喜欢读书和散步。`, excludedPartnerSchools: [], excludedPartnerSchoolGenders: [] };
  let ok = true;
  const started = Date.now();
  function record(method, res, assertion, route) {
    attemptedRequests.add(1);
    if (res.status === 429) limited.add(1);
    let valid = false;
    try { valid = res.status >= 200 && res.status < 300 && assertion(res.json()); } catch {}
    check(res, { 'expected business result': () => valid });
    if (valid) successfulRequests.add(1);
    (method === 'GET' ? reads : writes).add(res.timings.duration, { route });
    ok = ok && valid;
    return res;
  }
  function params(path, method) { return { headers, timeout: '10s', tags: { route: path, operation: method } }; }
  function request(method, path, payload, assertion) {
    return record(method, http.request(method, `${target.baseUrl}/v1${path}`, payload ? JSON.stringify(payload) : null, params(path, method)), assertion, path);
  }
  const routes = [
    ['/me/bootstrap', body => body.user.id === userId && body.dashboard != null],
    ['/me/questionnaire', body => body.versionId === 'release_autumn_20260920' && Boolean(body.submittedAt)],
    ['/me/contact-preferences', body => body != null && typeof body === 'object'],
    ['/questionnaire/current', body => body.id === 'release_autumn_20260920' && body.questions.length === 24],
  ];
  if (mode === 'home') {
    const responses = http.batch(routes.map(([route]) => ['GET', `${target.baseUrl}/v1${route}`, null, params(route, 'GET')]));
    responses.forEach((response, index) => record('GET', response, routes[index][1], routes[index][0]));
  } else if (mode === 'match') {
    request('GET', routes[0][0], null, routes[0][1]);
  } else if (mixed && iteration % 10 >= 8) {
    const nickname = `压测保存 ${n}`;
    request('PUT', '/me/questionnaire', { versionId: 'release_autumn_20260920', displayName: nickname, answers: data.answers, hardMatchForm: form }, body => body.saveState === 'SUBMITTED');
    request('GET', '/me/questionnaire', null, body => body.versionId === 'release_autumn_20260920' && body.submittedAt && body.answers.hard_one_liner_intro === form.oneLinerIntro);
  } else if (mixed && iteration % 10 === 7) {
    request('PUT', '/me/participation', { optIn: true, intent: 'BOTH' }, body => body.status === 'OPTED_IN' || body.participation?.status === 'OPTED_IN');
    request('GET', '/me/bootstrap', null, body => body.user.id === userId && body.dashboard.currentCycle?.participationStatus === 'OPTED_IN');
  } else {
    const [route, assertion] = routes[Math.floor(iteration / 2000 + iteration) % routes.length];
    request('GET', route, null, assertion);
  }
  flowDuration.add(Date.now() - started);
  failures.add(!ok);
  if (ok) { complete.add(1); if (iteration < 2000) successfulUsers.add(1); }
}
export function handleSummary(data) { return { [__ENV.SUMMARY_FILE || 'load-summary.json']: JSON.stringify({ config: { rate, seconds, mode, timeUnit, expectedIterations, expectedRequests, target: target.baseUrl, release: __ENV.RELEASE_SHA }, ...data }, null, 2) }; }
