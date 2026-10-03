---
kind: reference
lang: en
---

# Single-site public-network observation

This contract is recorded before the observer runs. This is a read-only observation of one deployed site, not an A/B test or a non-regression gate.

- Three rounds cover five public routes (`/`, `/about`, `/schools`, `/register`, `/register/school`) on desktop and mobile, cold context plus same-context warm revisit: 60 document samples. Twelve additional trusted-click samples cover home to About and registration.
- Only normal public navigation and local menu expansion are exercised. No email field is filled, no form is submitted, and no authentication or production-data mutation is deliberately requested. Natural page requests, including telemetry, are not intercepted. Non-read API requests are passively recorded without bodies or queries; their existence alone is not a failure.
- Chromium runs with `--no-proxy-server`, proxy environment variables removed, normal animation, no CPU/network throttling, and service workers blocked. Each context also explicitly bypasses every proxy destination (`bypass: '*'`, unused loopback proxy endpoint port 9): a diagnostic showed the launch flag alone still used macOS port 7897. This context-only setting does not change global proxy configuration. It does not itself prove physical location or coverage of mainland networks.
- Before and after sampling, a separate tab in the active isolated measurement browser reads Cloudflare trace. Only HTTP status, country, colo, trace timestamp/protocol/warp fields, destination port/address family/cache flags, and failures are retained; no IP address, cookie, or raw body is saved. The first probe must report CN and destination port 443 without a cached response, or sampling stops before public pages. The before/after browsers use the same configuration; each journey has a fresh process/context. A failed or missing final probe is not reported as a normal completed observation.
- Existing strict readiness, native FCP/LCP/initial-window CLS/TTFB, decoder evidence, and complete network error ledgers are reused. Native observations finish before interaction. Clicks use the existing observation window plus two-second dwell; SPA latency is a custom metric, not LCP or INP.
- DNS/TLS/HTTP failure, pending or failed required decode, missing main content/fonts, JavaScript errors, unexpected full-document transition, and timeouts remain failed observations. A faster failure is never treated as improved performance. The 14-minute overall deadline closes only the observer's active browser, preserves collected evidence, and reports unsampled scenarios.
- All 72 planned sample identities and every failure are saved. Descriptive p50/p75/min/max include only successful finite metrics, with successful and failed counts shown separately. Three rounds do not establish statistical non-regression. Results are `OBSERVED`, `OBSERVED_WITH_ERRORS`, or `INCOMPLETE`; there is no performance `PASS` verdict.

Example (only after independent origin/routing verification):

```sh
node scripts/performance/observe-site.mjs --url https://www.lilink.top --api-url https://api.lilink.top --output artifacts/performance/direct-network-20261003/browser-observation
```
