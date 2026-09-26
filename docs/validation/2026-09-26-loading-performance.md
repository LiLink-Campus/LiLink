# Loading and read-path performance validation

Reference: [The Perfect App Has No Loading States](https://floriankiem.com/writing/the-perfect-app-has-no-loading-states).

Branch: `codex/loading-performance-audit`; baseline: `8c4695910ead6ea81385d96f930f1f301097697c`.
The accepted product contract is to reveal complete artwork together with page content. Waiting for image readiness remains intentional; removing the image gate is not an optimization in this change.

## Implementation

| Audit area | Change and retained contract |
| --- | --- |
| First-screen images | Lossless, content-addressed about-page WebP; decoded RGBA equality; immutable caching. Home hero responsive preload starts outside awaited public data. ImageReadyPage and bounded failure fallback remain. |
| Background refresh | Schools and admin collections keep successful data and usable controls while refreshing; independent statistics have separate error/retry boundaries. |
| Read races | Admin responses are scoped to current query/admin; obsolete requests abort. Authorization failures clear private data. |
| Reward grants | Completed grants bypass campaign locking. First grants share the lifecycle advisory lock, with same-user serialization; campaign mutations retain the exclusive lock. Eligibility is rechecked inside the grant transaction. |
| Missing snapshots | Personal reads repair only that user's missing snapshot; full-cycle generation and disclosure lock ordering remain. |
| Home summary | One shared progress implementation computes the API read model. The guard's freshly verified identity is reused within the request. Full questions/answers stay on the editing route. |
| Navigation | Retain Next's existing Link/App Router prefetch. A session-scoped metadata revision invalidates home/profile/center after questionnaire, acknowledgement and contact writes. The current editor ignores its own notifications; returning editors wait for older writes and then re-read, with a bounded retry state. Ambiguous write failures trigger a read, never a claimed save success. No full-route coupon or secret prefetch, questionnaire payload cache or long-lived authorization cache. |
| Coupon reads | Parallel independent SSR reads; available/history keyset pages of 20 each, account-scoped cursor validation. Existing external GET list contract remains. Refresh after status changes reveals newly moved/new coupons. A 401/403 clears private cards and the open code dialog; 5xx preserves the successful list. |
| Polling and deadlines | Bounded complete read operations, cancellation, visible-only and single-inflight VIP/estimate/coupon reads. Temporary errors preserve confirmed data, while expiry and server authorization remain authoritative. Redemption secrets remain in the open dialog only. |
| Matching | Independent estimate queries run in parallel. Preserve candidate ordering, weights and solver: the measured all-compatible benchmark does not establish a benefit from hard-rule bucketing. |
| Measurement | Load tests use the current home aggregate. SSR expected identity is separate from actual target identity, with the existing isolated project/database allowlist. Browser tests record complete-image reveal and navigation, including normal motion. |

The rollout does not introduce a job queue, Redis, a new client data library, new indexes or a different matching algorithm. These were conditional investigation options in the audit, not proven fixes. The grant lock change keeps durable synchronous success semantics without adding an unverified asynchronous delivery system.

## Reproduction and evidence

Runtime: Node 24.20.0, npm 11.19.0; macOS; local Docker PostgreSQL 17 and Mailpit. All business fixtures are synthetic. The runner creates isolated loopback services on random non-5432 ports, applies current migrations, builds current source and cleans only its own resources. Browser engines are isolated Chromium and WebKit, not installed personal browsers or physical iOS devices.

API concurrency/lifecycle acceptance:

```sh
node scripts/e2e/run.mjs --api --testPathPatterns='performance-read-paths|promotion-independent|autumn-match-lifecycle|matching-priority|matching-batch|weekly-cycle'
```

Result: **6 suites / 50 tests passed**, `artifacts/e2e/499acefc21d0/{run.json,tests.log}`. Covers completed-grant fast reads, unrelated first-grant concurrency, same-user idempotency, campaign-end competition, single-user repair, lifecycle, matching priorities and batches.

Existing behavior checks: shared **110 passed**, Web **20 files / 125 passed**, targeted API **9 suites / 77 passed**. API lint and typecheck passed. The isolated browser runner's `build.log` confirms successful API and production Web builds, with the seeded API available before public prerendering. Final Web and Storybook typechecks passed; Web lint reports **0 errors / 5 existing warnings** in generated worker/navigation code. Logs: `artifacts/performance-20260926/final-{web-typecheck,storybook-typecheck,web-lint}.log`. Infrastructure/target checks passed (**5 tests**); changed CSS syntax and `git diff --check` passed.

### Browser acceptance status

```sh
node scripts/e2e/run.mjs e2e/specs/read-refresh.spec.ts e2e/specs/performance-contracts.spec.ts e2e/specs/navigation-performance.spec.ts e2e/specs/private-read-auth.spec.ts e2e/specs/loading-performance.spec.ts e2e/specs/home-artwork-preload.spec.ts e2e/specs/profile.spec.ts e2e/specs/profile-choice-rules.spec.ts e2e/specs/vip.spec.ts e2e/specs/community.spec.ts e2e/specs/auth.spec.ts
```

The application regression run `5a3b52615a7a` completed **216 tests: 203 passed, 13 failed**. Twelve failures were test setup/locator issues: the acknowledgement fixture selected an action not shown for an already eligible profile, and a generic alert locator also matched Next's announcer. Those fixtures were corrected without changing application code and all **32 navigation/auth scenarios passed** in `5721ab1b5856`. The remaining hidden-VIP assertion counted a transient streamed DOM duplicate. It now opens and verifies the visible VIP control; all **4/4 projects passed** in `6e423ad9b7d0`, preserving the request-coalescing, hidden-tab and obsolete-response assertions.

Additional contact-navigation coverage passed **12/12** in `0462b19ca047` (save before navigation, failed-save draft/retry, reused-email account isolation). Explicit pending-editor and coupon-reauthentication screenshots passed **12/12** in `3ab3a7581864` using the same application source. These are targeted corrections and evidence runs, not automatic retries. Raw failed reports remain intact. The current application, shared and script files match the full-run snapshot: **842 files checked, no differences**, excluding generated clients and runner-excluded environment templates; see `artifacts/performance-20260926/application-snapshot-check.json`.

Contact reproduction: `node scripts/e2e/run.mjs e2e/specs/contact-navigation.spec.ts`. Corrected navigation/auth reproduction: `node scripts/e2e/run.mjs e2e/specs/navigation-performance.spec.ts e2e/specs/private-read-auth.spec.ts`. Each browser run contains `run.json`, `results.json`, `tests.log` and an HTML report.

Engine versions were measured by launching the isolated engines:

| Project | Engine / version | Viewport |
| --- | --- | --- |
| chromium | Chromium 148.0.7778.96 | 1280 × 800 |
| mobile-chromium | Chromium 148.0.7778.96, Pixel 7 emulation | 412 × 839 |
| webkit | WebKit 26.4 | 1280 × 800 |
| mobile-webkit | WebKit 26.4, iPhone 13 emulation | 390 × 664 |

Playwright **1.60.0**, one worker; local loopback network and unthrottled CPU. Service workers are blocked. Default reduced motion is `reduce`; the about-page image scenarios explicitly cover both `reduce` and `no-preference`. These do not establish physical-device, installed Safari or PWA behavior.

Passing results in this completed run include all four projects' image-readiness cases: held images keep text hidden; failed images recover; stalled artwork observes the existing eight-second fallback; normal image arrival reveals the complete page. The home hero uses the same responsive preload as the rendered image and makes only one artwork request. Ready screenshots are in each corresponding `results/` directory. Pending image assertions produce JSON instead of screenshots: browser screenshot font/layout readiness can itself wait on the deliberately held image, so a screenshot would alter the intended pending-state observation.

Other completed entries prove school refresh retains usable data, obsolete admin queries do not replace the current filter, statistics fail/retry independently, expired admin reads clear private data, school-read timeout allows manual recovery, match-estimate timeout allows a fresh read, and coupon pagination preserves bounded results without duplicates. The VIP expiry fixture was corrected before the final application run and its transient-error/expiry checks passed on all four projects.

The payload comparison comes from `8c4b4f4e004f`, whose home read model matches the final implementation. Final image screenshots and cold/warm samples come from `bc52d939a072` (**12/12 passed**): both motion settings now also wait for main opacity to reach 1, so ready screenshots include the completed fade-in. The JSON reporter embeds named attachment bodies in `results.json`; the HTML report exposes the same evidence. `home-read-model-bytes` compares the completed synthetic user's new home payload with the **same current data reconstructed in the previous aggregate shape**. It is an uncompressed API response-size comparison, not captured historical traffic, browser transfer bytes, SQL count or production latency. **All four projects report 1,761 bytes versus 16,826 bytes (89.5% smaller).** The comparison excludes browser transfer.

`complete-first-screen-performance` records about-page cold-context and warm-revisit visibility times, artwork resource sizes, browser version, viewport and cache/network conditions. Visibility timing includes assertion polling overhead; a new browser context does not mean a cold Next server. Samples below use reduced motion, are observational and have no before/after latency claim:

| Project | Cold-context complete visibility | Warm-revisit complete visibility | Cold artwork transfer | Warm artwork transfer |
| --- | --- | --- | --- | --- |
| chromium | 106.2 ms | 69 ms | 941,834 bytes | 0 bytes |
| mobile-chromium | 115 ms | 62 ms | 941,834 bytes | 0 bytes |
| webkit | 119 ms | 62 ms | 941,834 bytes | 0 bytes |
| mobile-webkit | 116 ms | 54 ms | 941,834 bytes | 0 bytes |

Cold encoded artwork size is 941,534 bytes in every engine. WebKit reports zero encoded/decoded sizes on these cached revisits, so those fields must not be interpreted as an empty image. Each sample includes the asserted complete image-ready state; warm transfer zero is the browser-reported resource-timing value.

IAB review covered desktop **1280 × 800** and mobile **390 × 844**: about artwork, public home, dashboard, profile, coupon pagination/QR dialog, school search dialog, eight admin collections and cycle statistics. The final preview `ee82603920ed` additionally covered pending profile synchronization, bounded timeout, successful retry to the saved new nickname, and the coupon reauthentication view. Faults were injected only into the isolated tab's fetch requests, then cleared; a reload restored the normal coupon list. Both temporary preview runs were explicitly stopped, their own processes/containers cleaned, tabs closed and viewport override reset. Exit code 130 on these preview runs records intentional termination.

IAB screenshots are native images retained in this task. WebKit screenshot files for the new states are also available as `artifacts/performance-20260926/{webkit,mobile-webkit}-{profile-awaiting-previous-save,coupons-reauthentication}.png`, extracted unchanged from `3ab3a7581864/results.json`. They show complete labels, working-size buttons and no horizontal overflow. Registration/admin failure-state functional coverage and screenshots are in the browser reports; this does not imply that every fault combination was manually replayed in IAB.

The navigation fix addresses a demonstrated saved-nickname regression in Next Router Cache. Successful or ambiguous write settlement invalidates related reads without cancelling a committed write or restarting the current editor. Re-entering a dirty page can require one bounded aggregate read; this is a correctness tradeoff, not a claimed navigation latency improvement. The tests cover soft navigation/back, acknowledgement-only updates, late acknowledgement, late autosave, fresh server snapshots and authorization loss.

### Resource and compute evidence

Lossless image evidence: 1,326,798 → 941,534 bytes (**29.0% smaller**); equal decoded RGBA. See [resource reproduction](../e2e-testing.md). This is an asset-size measurement, not a claim of 29% faster page load.

The actual `HomeArtworkPreload` component was also exercised with React 19's server renderer and a deliberately unresolved content promise: the initial chunk contained its image preload while content was absent; content arrived after promise release. Evidence: `artifacts/home-artwork-stream/evidence.json`. This is component-level streaming evidence with a synthetic resource, not a measurement of the deployed Next response or slow upstream API.

Matching isolated CPU baseline (all-compatible pools; candidate count, exact pair count and participant uniqueness assertions passed):

| Participants | Total | Peak RSS | Candidates |
| --- | --- | --- | --- |
| 500 | 444 ms | 153 MiB | 124,750 |
| 1,000 | 1,699 ms | 381 MiB | 499,500 |
| 2,000 | 6,907 ms | 838 MiB | 1,999,000 |

Reproduction from the repository root after the normal shared/API build:

```sh
cd apps/api
node ../../scripts/release/benchmark-worker.mjs
```

At 2,000 participants, candidate generation consumed 6,293 ms and solving 538 ms. The parent process event-loop p99 was about 21.6 ms (20 ms sampling resolution); peak RSS is sampled every 50 ms, not an exact instantaneous maximum. This synthetic isolated benchmark is not an online capacity or production latency claim. The worker already runs outside the main thread. Evidence: `artifacts/performance-20260926/matching-benchmark.jsonl`.

### Final outcome

**228 unique browser scenario/project combinations have a passing latest result, with no unresolved failure or retry.** This combines the final application regression, the corrected navigation/auth and VIP fixtures, and contact-navigation coverage; it does not relabel the original failed run as green. The deduplicated index is `artifacts/performance-20260926/latest-contract-results.json`, keyed by test file, scenario title and browser project, with each result's source run ID. All temporary resources from completed runs were checked and no owned containers remained.

| Evidence | Result |
| --- | --- |
| Final browser application matrix and targeted corrections | 228 distinct combinations passed |
| Isolated API concurrency/lifecycle E2E | 50 passed |
| Existing focused API behavior tests | 77 passed |
| Existing shared / Web behavior tests | 110 / 125 passed |
| API/Web builds and typechecks, Storybook typecheck | Passed |
| API lint / Web lint | Passed / 0 errors, 5 existing warnings |
| Infrastructure and load-target checks | 5 passed |
| Changed CSS syntax / final diff check | Passed |

For the complete current browser matrix in one fresh isolated run, append `e2e/specs/contact-navigation.spec.ts` to the browser command above. To repeat only the corrected visibility check: `node scripts/e2e/run.mjs e2e/specs/read-refresh.spec.ts --grep 'profile pauses hidden VIP'`. Existing focused API behavior checks: `npm run test --workspace api -- --runInBand --testPathPatterns='jwt-auth.guard|page-bootstrap.controller|activation.service|dashboard-snapshot|coupon.service|match-estimate.service|matching.engine|matching.executor'`.

## Validation boundaries

The results above were collected locally before PR submission; remote CI results are reported separately on the PR. No deployment, production data operation or remote load test was performed. Timing artifacts must be interpreted with their recorded environment/cache/network settings; they are not before/after production measurements. Existing full list API callers remain unbounded until they explicitly adopt the new paginated contract; the application coupon page uses the bounded contract.

## Release and rollback

`GET /v1/me/page-bootstrap/home` replaces the full `questionnaire` and `savedQuestionnaire` fields with the summary read model. Old Web consumers require the old fields, and new Web consumers require `questionnaireProgress`; mixed API/Web versions are incompatible. Release the matching API and Web revisions in one coordinated window and roll them back together. This change does not provide a zero-downtime compatibility transition. The new coupon page also requires the new overview and pagination endpoints.

Build shared code before both applications using the existing workspace scripts. No database schema, migration or dependency changes are included. An application rollback must not undo completed coupon grants or profile writes. The original PNG remains available, and the new WebP uses a content-hashed URL.
