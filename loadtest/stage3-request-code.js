// Stage 3: register-code request under load (STAGING ONLY, never prod).
//
// Target: POST /v1/auth/request-code
//   - resolves school by email domain (cached in resolver),
//   - hashes 6-digit code via HMAC,
//   - inserts a verification_code row,
//   - enqueues an outbound email and tries immediate SMTP delivery
//     (Mailpit accepts everything; queue is the bottleneck).
//
// Per-email throttle is 3/min, per-IP is 1000/min. With 300 unique emails
// at 12s pacing each, we sit comfortably under both caps.
//
// Why NOT against production:
//   - it would hit the real SMTP provider (cost + abuse signal),
//   - it pollutes verification_code rows,
//   - it can warm-up SMTP rate limits at the upstream.
//
// Usage (after staging-up.sh):
//   k6 run -e BASE_URL=http://127.0.0.1:4001/v1 \
//          -e EMAIL_DOMAIN=bupt.edu.cn \
//          loadtest/stage3-request-code.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:4001/v1';
const EMAIL_DOMAIN = __ENV.EMAIL_DOMAIN || 'bupt.edu.cn';
// Default 12s pacing keeps unique-email volume modest. Set SLEEP_SECONDS=2
// to burst the SMTP queue and verification_code writes.
const SLEEP_SECONDS = Number(__ENV.SLEEP_SECONDS || '12');

if (BASE_URL.includes('api.lilink.top')) {
  throw new Error('Refusing to run stage 3 against production. Set BASE_URL to staging.');
}

const requestLatency = new Trend('request_code_latency', true);
const ok = new Counter('request_code_ok');
const rateLimited = new Counter('request_code_rate_limited');
const badRequest = new Counter('request_code_bad_request');
const serverError = new Counter('request_code_5xx');

export const options = {
  scenarios: {
    request_code: {
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
    'request_code_5xx': ['count==0'],
    'request_code_latency': ['p(95)<1500', 'p(99)<3000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  // Unique email per VU + iteration keeps us off the 3/min per-email cap.
  const email = `loadtest.vu${__VU}.iter${__ITER}@${EMAIL_DOMAIN}`;

  const res = http.post(
    `${BASE_URL}/auth/request-code`,
    JSON.stringify({ email }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'request_code' },
    },
  );

  requestLatency.add(res.timings.duration);

  if (res.status === 200 || res.status === 201) {
    ok.add(1);
  } else if (res.status === 429) {
    rateLimited.add(1);
  } else if (res.status === 400) {
    badRequest.add(1);
  } else if (res.status >= 500) {
    serverError.add(1);
  }

  check(res, {
    'no 5xx': (r) => r.status < 500,
    'accepted or throttled': (r) =>
      r.status === 200 || r.status === 201 || r.status === 429,
  });

  sleep(SLEEP_SECONDS);
}
