// Stage 1: public read-only endpoints under load.
//
// Targets:
//   - GET /v1/health
//   - GET /v1/public/landing       (30s in-memory cache)
//   - GET /v1/public/schools       (30s in-memory cache)
//
// Profile: ramps to 300 VUs, holds for 60s, ramps down. ~100-300 RPS expected.
//
// Usage (from repo root):
//   k6 run loadtest/stage1-public-readonly.js
//   k6 run -e BASE_URL=http://127.0.0.1:4000/v1 loadtest/stage1-public-readonly.js
//
// Safe for production: zero writes, zero email side effects.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://api.lilink.top/v1';

const ROUTE_NAMES = ['health', 'public_landing', 'public_schools'];
const ROUTE_PATHS = ['/health', '/public/landing', '/public/schools'];

const routeLatency = {
  health: new Trend('latency_health', true),
  public_landing: new Trend('latency_public_landing', true),
  public_schools: new Trend('latency_public_schools', true),
};

export const options = {
  scenarios: {
    public_readonly: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '20s', target: 300 },
        { duration: '60s', target: 300 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    'latency_health': ['p(95)<200'],
    'latency_public_landing': ['p(95)<300'],
    'latency_public_schools': ['p(95)<300'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const idx = Math.floor(Math.random() * ROUTE_PATHS.length);
  const name = ROUTE_NAMES[idx];
  const path = ROUTE_PATHS[idx];

  const res = http.get(`${BASE_URL}${path}`, {
    tags: { route: name },
    headers: { Accept: 'application/json' },
  });

  routeLatency[name].add(res.timings.duration);

  check(res, {
    'status 2xx': (r) => r.status >= 200 && r.status < 300,
    'has body': (r) => r.body && r.body.length > 0,
    'no 5xx': (r) => r.status < 500,
  });

  sleep(Math.random() * 2 + 1);
}
