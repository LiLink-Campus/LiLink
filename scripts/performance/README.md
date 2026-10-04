# Public page performance comparison

Additional behavioral contracts: [collector failure detection](failure-contracts.md), [immediate-click comparison](early-click-contract.md), and [single-site public-network observation](observe-site-contract.md).

## Failure boundaries fixed before implementation

- A page may return 200 while its artwork, fonts, hydration or visible content is still unavailable. Strict `contentReadyMs` requires a visible heading, completed first-screen images, loaded fonts, completed image-reveal state and usable route controls. Homepage `previewVisibleMs` and `heroHdReadyMs` are independent document-start measurements: preview needs heading, both hero links and decoded visible artwork, while HD needs the current responsive image decoded and visible. They do not wait for DCL, application scripts or fonts. Baselines without inline preview use the visible HD artwork for preview readiness. Image failures remain failures even when an eight-second product fallback reveals content.
- `networkidle`, a test's duration, and all-page scrolling are not FCP or LCP. Observe native paint entries before scripts execute; do not scroll or click before collecting document metrics. Record the finite observation window. CLS uses the largest layout-shift session window and excludes recent user input.
- A client transition retains the old document's navigation timing. Measure trusted click to target content readiness separately, and never relabel it as FCP, LCP or INP.
- Disabling prefetch can move work from idle time to the user's click. After source readiness and its minimum five-second observation window, scroll the real link into view and allow a further fixed two-second dwell before clicking, including the home registration link below the fold. This measures a visit that gives prefetch time to finish; it does not establish immediate-click performance.
- HTTP errors, failed resource requests, JavaScript errors, missing paint entries, timeouts or insufficient samples must remain visible in raw evidence and prevent a conclusive pass. Anonymous auth 401, local Vercel telemetry 404 and canceled requests are reported separately; critical document/script/style/font/image failures are never exempted.
- Keep the complete click-journey request ledger through target validation, including requests started before the click that fail afterward. Click-stage transfer is a timestamp slice, not a destructive reset. Every decode already started at readiness must have completed successfully; readiness captures that evidence and client transitions also retain a target observation. Later lazy-image decodes are not retrospectively classified as readiness dependencies.
- Browser caching must not contaminate cold samples. Each cold route and click journey gets a fresh browser process/context; its warm revisit shares that context. Server/CDN caches are explicitly not purged. Before and after run serially in alternating order, with identical viewport, network and CPU settings.
- A successful localhost comparison does not measure production Vercel DNS/TLS, mainland routing, congestion or edge-cache misses. `--no-proxy-server` and removal of proxy environment variables request proxy bypass; they do not prove the browser's actual path. On this macOS host, a CDP-created context still used the system proxy until an explicit context-wide bypass was applied. The single-site observer verifies its browser path with actual trace-page navigation before and after sampling; see its contract. None of these settings independently verifies OS VPN/TUN state. Network profiles are controlled synthetic pressure only.
- A production-source comparison must identify the exact revision from current production deployment metadata. A resource-change comparison against an already dirty checkout must instead freeze that checkout before editing and identify its source digest. HEAD cannot stand in for either source without evidence. Different public data, environment or build settings must be disclosed separately.

## Run

No build, database mutation, login or production change is performed by this script. Start the two production-mode Web services separately, with the same synthetic API data. Each session file needs `webUrl`; optional `apiUrl`, `runId`, `expiresAt` help identify the environment. Runner files must still be unexpired when sampling starts.

```sh
node scripts/performance/compare.mjs --before-session artifacts/e2e/BEFORE/session.json --after-session artifacts/e2e/AFTER/session.json --before-label HEAD-SHA --after-label working-tree-SHA --rounds 10 --profile mobile-pressure --output artifacts/performance/public-pressure
node scripts/performance/summarize.mjs artifacts/performance/public-pressure/raw.json
```

Alternatively specify `--before-url https://before.example.test --after-url https://after.example.test`. URLs must be credential-free public page origins without query strings; optional `--before-api-url` and `--after-api-url` classify API resources. Both Web builds retain their own same-origin static resources; no independent CDN is used. Do not supply signed URLs or account tokens. Raw output stores paths without URL queries or request/response headers.

Defaults: five paired rounds (ten preferred), desktop and mobile, home/about/schools/register/register-school cold and warm, plus home→about and home→register clicks. `--rounds` below five is rejected except explicit `--smoke`, whose report is always INCONCLUSIVE. `--viewports desktop` and `--routes home,about` narrow a diagnostic run. `--profile unthrottled` is local unthrottled; `mobile-pressure` applies CDP 150 ms latency, 10 Mbps download, 2 Mbps upload and 4× CPU slowdown to every origin. It is not a country measurement. Normal motion is retained; `--motion reduce` creates a separately labeled diagnostic run.

Native metrics are sampled for at least five seconds after navigation and one second after semantic readiness; LCP must also have been quiet for one second. `--observation-ms` changes the minimum window. Navigation, readiness and observation each have a separate 30-second timeout; email-feedback validation uses ten seconds. These are per-step deadlines, so a complete sample can take longer than 30 seconds. Images used in the initial viewport are decoded; the application's existing background image decoder is observed without initiating additional requests. No all-page scroll occurs during document measurements. The registration click necessarily scrolls its link into view after source readiness and observation, waits the same two-second dwell, then performs a trusted browser click. After native metrics are frozen, actual mobile menu clicks and synthetic school-email input verify visible feedback, recorded as custom `menuFeedbackMs` and `emailFeedbackMs`; these are not INP. No registration is submitted.

Artifacts: `harness-source/` (measurement sources and SHA-256 manifest), `raw.json` (updated atomically after each sample; configuration, full samples, paint/shift/resource entries, browser version, visibility evidence and failures), `summary.json` and `summary.md` (after each complete round and at exit), and first-round viewport screenshots. A summary can be regenerated without browser execution. New comparison revision `independent-first-screen-complete-journey-v3` must not be pooled with older measurements; both variants use the same revised harness. A resumed run must preserve the same harness source. Exit codes are 0 for PASS, 1 for FAIL, and 2 for INCONCLUSIVE, including smoke. Browser caches are isolated; SW is blocked for this primary comparison, so installed PWA revisit performance requires a separate run. Initial-window CLS does not cover a whole browsing session.

## Baseline source and mainland acceptance

For a local production-source baseline, `serve-baseline.mjs` accepts the exact full commit SHA as its third positional argument; it defaults to `HEAD` only when that argument is omitted. First start the isolated runner with `--serve --extra-client-origin=http://127.0.0.1:61081`, then use its unexpired session:

```sh
node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61081 a4f91a47cda9836e1d3f7c100d12fba12af4230c
```

The SHA in this example was identified from production deployment metadata for the 2026-10-04 comparison; verify the current production revision for each new run. This helper builds an isolated Git archive with the same disposable synthetic API, leaves the checkout untouched, and records the resolved revision in `comparison-session.json`. A local rebuild of production source is still a laboratory baseline, and changed build settings or API data must be disclosed.

For a before/after comparison of new edits on top of existing uncommitted work, freeze the source **before** editing. Keep a `before-source.json` manifest next to its `before-source/` directory under local `artifacts/`. The manifest declares `sourceDigest` as SHA-256 of `JSON.stringify(files)` and a nonempty `files` array of `{ path, sha256 }` entries. Sources are regular files from `apps/web/`, `packages/shared/`, `scripts/images/`, and the root package manifests; exclude credentials, dependencies, build output and symlinks. The helper verifies each file and its digest before building, so later source changes cannot silently alter the baseline.

The frozen snapshot is the fourth argument, after the session, port and `HEAD` placeholder:

```sh
node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61081 HEAD --snapshot=artifacts/RESOURCE_RUN/before-source.json
```

This mode builds the snapshot rather than HEAD. Its canonical `artifacts/performance/baseline-RUN/comparison-session.json` records `sourceDigest`, `sourceSnapshot`, the shared synthetic API and unexpired disposable session; `revision` is null. Use that digest for the before label. It proves which uncommitted source was compared, not which version production currently serves. Keep a production-SHA comparison separate when validating production behavior. Do not combine measurements from separate baselines or reconstruct a lost dirty snapshot from a later HEAD.

The candidate keeps its frontend and all images, JS, CSS and fonts on Vercel. A real mainland A/B comparison needs the candidate deployed to Vercel alongside the current production baseline and matched sampling conditions. Deployment requires user authorization; a local PASS or single-site observation cannot substitute for that comparison or confirm production ISR usage.

## Predeclared interpretation

Per scenario/viewport/metric report median, p75, paired deltas and deterministic bootstrap 95% confidence intervals for the difference in medians and p75s, preserving pairs when resampling. Timing tolerance is the larger of 100 ms and 10% of the before median; custom UI feedback uses the larger of 20 ms and 10%; CLS tolerance is 0.02 and after p75 must not exceed 0.1. These are engineering tolerances, not a promise of equal speed. A lower confidence bound beyond tolerance is FAIL. A PASS requires at least ten complete pairs, both upper bounds at or below tolerance, the after p75 also within tolerance, and no missing metrics/critical functional failure. Everything else is INCONCLUSIVE, including five pairs with no observed regression. Overall status never overrides a failing or inconclusive metric. Report lab FCP/LCP/CLS/TTFB and content-ready independently; there is no field Core Web Vitals or real mainland claim.

Homepage preview and HD milestones are captured by a document-start animation-frame observer, so a later script or image stall does not erase the earlier timestamp. Raw first-screen evidence records the visible artwork source, controls, current responsive HD source, document ready state and decode state; time precision is bounded by browser animation frames and the configured CPU pressure. The observer decodes only the existing HD image and an inline `data:image` preview; it does not start another HTTP image request. The primary cold/warm homepage report separately gates candidate p75 `previewVisibleMs <= 2000` and native `lcpMs <= 2500`, requiring ten complete pairs. These absolute gates can fail even when relative non-regression passes. Full content readiness is still reported separately.

Validate the independently observed milestones and native early navigation using browser-rendered synthetic responses in the disposable environment:

```sh
node scripts/performance/validate-failures.mjs artifacts/e2e/RUN/session.json artifacts/performance/first-screen-collector --first-screen-only
```
