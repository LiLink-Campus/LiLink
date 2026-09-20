import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import exec from 'k6/execution';
import { check, fail } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { resolveLoadTarget } from './targets.mjs';

const target = JSON.parse(open(__ENV.TARGET_FILE));
const verified = resolveLoadTarget(target);
const secret = open(__ENV.ACCESS_FILE).trim();
const cookies = JSON.parse(open(__ENV.SSR_COOKIES_FILE));
const frontend = JSON.parse(open(__ENV.SSR_IDENTITY_FILE));
const base = 'https://release-20260920.lilink.top';
const mode = __ENV.MODE;
const rate = Number(__ENV.LOAD_RATE);
const seconds = Number(__ENV.LOAD_DURATION_SECONDS);
const expected = Math.floor(rate * seconds / 60);
if (!['ssr-home', 'ssr-match'].includes(mode) || __ENV.RATE_TIME_UNIT !== '1m'
  || !Number.isInteger(rate) || rate < 1 || rate > 1000
  || !Number.isInteger(seconds) || seconds < 1 || seconds > 120 || expected < 1
  || frontend.sha !== __ENV.RELEASE_SHA || frontend.alias !== base
  || frontend.projectId !== 'prj_bdgQbPghUNmgkWPueeJq8Z6ZAb4J'
  || frontend.branch !== 'codex/questionnaire-reset-release' || frontend.state !== 'READY'
  || cookies.length !== 1 || cookies[0].name !== '_vercel_jwt') {
  throw new Error('Unverified preview or oversized SSR schedule.');
}
const failed = new Rate('business_failures');
const complete = new Counter('completed_business_iterations');
const users = new Counter('first_pass_successful_fixture_users');
const limited = new Counter('unexpected_429');
const duration = new Trend('complete_ssr_html_ms', true);
export const options = {
  scenarios: { release: { executor: 'constant-arrival-rate', rate, timeUnit: '1m', duration: `${seconds}s`, preAllocatedVUs: 100, maxVUs: 250, gracefulStop: '15s' } },
  thresholds: {
    dropped_iterations: ['count==0'],
    business_failures: ['rate<0.005', { threshold: 'rate<=0.02', abortOnFail: true, delayAbortEval: '30s' }],
    unexpected_429: ['count==0'],
    complete_ssr_html_ms: ['p(95)<=3000'],
    completed_business_iterations: [`count>=${Math.ceil(expected * 0.995)}`],
    first_pass_successful_fixture_users: [`count>=${Math.ceil(Math.min(expected, 2000) * 0.995)}`],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
};
function jwt(id) {
  const h = encoding.b64encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'rawurl');
  const p = encoding.b64encode(JSON.stringify({ sub: id, email: `${id}@release.example.test`, exp: Math.floor(Date.now() / 1000) + 7200 }), 'rawurl');
  return `${h}.${p}.${crypto.hmac('sha256', secret, `${h}.${p}`, 'base64rawurl')}`;
}
export function setup() {
  const r = http.get(`${target.baseUrl}/__release`, { headers: { 'x-release-access': secret } });
  if (r.status !== 200) fail('API identity unavailable');
  const b = r.json();
  if (b.projectId !== target.projectId || b.branchId !== target.branchId || b.database !== verified.database
    || b.host !== verified.directHost || b.release !== __ENV.RELEASE_SHA || b.synthetic !== true || b.users !== 2000) {
    fail('API identity mismatch');
  }
  const probe = http.get(`${target.baseUrl}/v1/me/bootstrap`, {
    headers: { 'x-release-access': secret, Cookie: `lilink_rehearsal_token=${jwt('release_user_1999')}` }, timeout: '10s',
  });
  if (probe.status !== 200 || probe.json().user?.id !== 'release_user_1999') fail('Live API preflight failed');
}
export default function () {
  const n = exec.scenario.iterationInTest % 2000;
  const id = `release_user_${String(n).padStart(4, '0')}`;
  const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    + `; lilink_release_access=${secret}; lilink_rehearsal_token=${jwt(id)}`;
  const route = mode === 'ssr-home' ? '/dashboard' : '/dashboard/match';
  const r = http.get(base + route, { headers: { Cookie: cookie }, timeout: '12s', redirects: 0, tags: { route } });
  const ok = r.status === 200 && r.body.includes(id)
    && r.html().find('h1').text().includes(mode === 'ssr-home' ? '你好' : '我的匹配')
    && !r.body.includes('暂时无法加载') && !r.body.includes(':E{');
  check(r, { 'rendered expected user page': () => ok });
  failed.add(!ok);
  limited.add(r.status === 429 ? 1 : 0);
  duration.add(r.timings.duration);
  if (ok) {
    complete.add(1);
    if (exec.scenario.iterationInTest < 2000) users.add(1);
  }
}
export function handleSummary(data) {
  return { [__ENV.SUMMARY_FILE]: JSON.stringify({ config: {
    mode, rate, seconds, expectedIterations: expected,
    expectedApiRequests: expected * (mode === 'ssr-home' ? 4 : 1),
    release: __ENV.RELEASE_SHA, deploymentId: frontend.deploymentId,
  }, ...data }, null, 2) };
}
