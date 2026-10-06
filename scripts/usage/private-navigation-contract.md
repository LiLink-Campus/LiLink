---
kind: reference
lang: en
---

# Private navigation comparison

The collector measures two real authenticated journeys: user center dwell → referrals → browser Back, and admin overview with its mobile menu expanded → merchants → browser Back. Each desktop/mobile viewport covers hover, keyboard focus, touch, and a quick click without prior intent. Touch on desktop is explicitly emulated; the collector dispatches real CDP touch start/end input rather than a DOM event. Source and destination headings must be visible, destination data must finish loading, and Back must restore the source heading. This contract is declared before collecting candidate evidence. The overview's independent primary task links may still prefetch `/admin/users`; their requests remain in the ledger and are not attributed solely to the sidebar policy.

## Failure boundaries and gates

- Reject noncanonical, expired, foreign-repository, non-loopback, or inactive sessions. Resolve the PostgreSQL port only from the runner-owned `lilink-e2e-db-<run>` container, require its matching ownership label, and call `assertTestDatabase` before creating synthetic accounts. Never read a credential-bearing environment file or target existing development/production data.
- A paired comparison uses the same disposable API/data and two production Web builds from the canonical comparison metadata. Require 10 complete pairs for all 16 viewport/journey/intent cells; alternate before/after and after/before by round. A missing sample, request attribution/completion gap, functional failure, or nonfinite timing is FAIL. Fewer than 10 configured rounds cannot pass.
- Measure click-to-ready and Back-to-ready with real monotonic time. For each metric/cell compute median, p75, and deterministic 5,000-resample paired bootstrap 95% intervals for candidate-minus-baseline differences. The tolerance is `max(100 ms, 10% of baseline median)`. Median/p75 differences and both upper 95% bounds must be within tolerance. An inconclusive interval is INCONCLUSIVE, never PASS.
- Capture every CDP HTTP request by request ID with the phase assigned at initiation: source load, dwell, intent, navigation, return, and final settlement. Keep JavaScript, CSS, RSC, direct API, same-origin API, document, other assets, and telemetry distinct. Record initiated requests, browser disk/memory cache, worker responses, wire 304, completed requests, failures, cancellation, and unfinished requests separately. Cached responses are not inferred from zero transfer bytes.
- “Unused prefetch” means an observed prefetch RSC path outside the source/destination routes of this finite journey. This is a path-level diagnostic, not proof that no downloaded chunk was reused. Prefetch for the eventual destination is counted separately. Warm browser cache responses are excluded from the observed network count; 304 remains a network request.
- Browser failures, request cancellation, HTTP failures, and incomplete requests remain in the raw ledger. Expected cancellation is reported without treating it as a successful response; cancellation during navigation is allowed only when the visible functional contract still passes. Non-browser-cache initiation counts do not prove server receipt: wire response and cancellation-before-response counts are separate, and partial transfer bytes on cancellation are only observed lower bounds. The local Next server does not serve the platform's `/_vercel/` telemetry script; its observed 404 remains a failed request and an explicit telemetry coverage gap, but does not fail the application's navigation contract. All application JS/CSS/API failures fail the gate. Request bodies, cookies, authorization/trace headers, emails, passwords, and tokens are never saved. Screenshots mask account email and user tables.

## Reproduction

Use Node 24, npm 11, locked dependencies, Docker, and isolated Playwright Chromium. The source session must come from `node scripts/e2e/run.mjs --serve --serve-minutes=90`; no normal developer service is accepted. The collector creates two synthetic accounts inside that disposable run and authenticates before starting its browser ledger. The runner destroys the database at session shutdown. Service workers are blocked so this experiment isolates navigation prefetch, and the network is unthrottled loopback. Timing and visibility use real time, not a simulated clock.

```sh
# One-site baseline discovery: one sample per cell, no performance verdict.
node scripts/usage/private-navigation.mjs artifacts/e2e/RUN/session.json artifacts/private-navigation/BEFORE --phase before

# Candidate session must allow the baseline origin through real API CORS.
node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61081 BASELINE_FULL_SHA
node scripts/usage/private-navigation.mjs artifacts/e2e/RUN/session.json artifacts/private-navigation/PAIR --pair artifacts/performance/baseline-RUN/comparison-session.json

# Rebuild only the summary from retained, sanitized raw evidence.
node scripts/usage/private-navigation.mjs --summarize artifacts/private-navigation/PAIR/raw.json
```

Use a new output directory per capture. `raw.json` includes the declared gate, tool digest, Web build IDs/source revisions, engine/version, host/CPU, viewport, input intent, dwell duration, full sanitized request ledgers, timings, failures, and screenshot paths. Screenshots mask account email, referral codes, and user tables. `summary.json` and `summary.md` can be regenerated without a running database or browser. Original samples are never silently retried or discarded. A fatal interruption retains completed samples and makes the paired summary FAIL.

The one-site mode reports unused prefetch and requests without a comparative speed claim. Pair mode reports request and timing changes separately; a request decrease cannot compensate for a failed readiness gate. Local results do not establish Vercel CDN Request CPU Duration, bills, production cache behavior, physical iOS, or mainland mobile performance. Deployment, exact-commit CI, production telemetry, and 24-hour/7-day platform measurements remain separate evidence.
