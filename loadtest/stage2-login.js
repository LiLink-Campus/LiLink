// Stage 2: login under load (production OK with seeded test accounts).
//
// Target: POST /v1/auth/login  (argon2 verify -> CPU heavy)
//
// Per-email throttle is 5/min. With 27 bulk seed accounts, the absolute
// upper bound is ~135 successful logins per minute (200 RPS already trips
// 429 for ~50% of requests). We therefore stay at 100 VUs and pace each
// VU at 12s between attempts so we mostly stay under the per-email cap.
//
// Prerequisite: run loadtest/seed-test-users.sh first to obtain
//   ACCOUNTS_FILE (one email per line). Pass the path via env.
//
// Usage:
//   k6 run -e ACCOUNTS_FILE=loadtest/.accounts.txt \
//          -e BASE_URL=https://api.lilink.top/v1 \
//          loadtest/stage2-login.js
//
// Watch for: p95 latency, CPU saturation, and any 5xx (429 is expected).

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'https://api.lilink.top/v1';
const PASSWORD = __ENV.PASSWORD || 'TestDemo_LiLink_42!';
const ACCOUNTS_FILE = __ENV.ACCOUNTS_FILE || 'loadtest/.accounts.txt';
// Default 12s pacing keeps each email under the 5/min cap. Override with
// SLEEP_SECONDS=2 or similar to deliberately trip throttles and probe argon2
// CPU behaviour under burst.
const SLEEP_SECONDS = Number(__ENV.SLEEP_SECONDS || '12');

const accounts = new SharedArray('accounts', () => {
  const fs = open(ACCOUNTS_FILE);
  return fs
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
});

if (accounts.length === 0) {
  throw new Error(`No accounts loaded from ${ACCOUNTS_FILE}; run seed-test-users.sh first.`);
}

const loginLatency = new Trend('login_latency', true);
const loginRateLimited = new Counter('login_rate_limited');
const loginSuccess = new Counter('login_success');
const loginUnauthorized = new Counter('login_unauthorized');
const loginServerError = new Counter('login_5xx');

export const options = {
  scenarios: {
    login: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 50 },
        { duration: '60s', target: 100 },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.30'],
    'login_5xx': ['count==0'],
    'login_latency': ['p(95)<800', 'p(99)<2000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const email = accounts[(__VU + __ITER) % accounts.length];

  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
    },
  );

  loginLatency.add(res.timings.duration);

  if (res.status === 200 || res.status === 201) {
    loginSuccess.add(1);
  } else if (res.status === 429) {
    loginRateLimited.add(1);
  } else if (res.status === 401 || res.status === 400) {
    loginUnauthorized.add(1);
  } else if (res.status >= 500) {
    loginServerError.add(1);
  }

  check(res, {
    'no 5xx': (r) => r.status < 500,
    'expected status': (r) =>
      r.status === 200 || r.status === 201 || r.status === 429 || r.status === 401,
  });

  sleep(SLEEP_SECONDS);
}
