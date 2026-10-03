---
kind: reference
lang: en
---

# Performance collector browser failure contracts

Written before the fault runner. These are isolated end-to-end browser checks against the runner's disposable loopback Web/API/CDN. They make no business mutation and do not replace the paired performance comparison.

1. Hold the real About background response indefinitely. The real product may reveal its heading after the existing eight-second fallback, but the collector must still reject readiness while the background's actual `decode()` promise is pending. Expected evidence: the fallback heading is visible, a decoder remains pending, `sampleDocument` has no successful timing metrics and reports a readiness timeout. Release/abort the held route in `finally` and close only this test's isolated browser.
2. Hold one real `/about` RSC prefetch from the homepage before the click. Click the real homepage registration link. Only after the `/register` navigation request begins, abort the older `/about` request with `net::ERR_FAILED`. Registration must become normally visible, while the collector's complete journey ledger retains the older failure and reports `critical-resource-errors`. Expected evidence includes the trusted click, held-request start before it, abort trigger afterward, target observation, non-null click-to-ready metric and failed collection verdict. A timing slice alone must not hide the earlier request.

Run after the formal comparison finishes, with no other performance browser active:

```sh
node scripts/performance/validate-failures.mjs artifacts/e2e/RUN/session.json artifacts/performance/collector-failure-contracts
```

The command succeeds only when both deliberate failures are rejected by the collector. `failure-contracts.json` and screenshots retain the assertions and raw sample evidence. A successful fault check means the collector catches these failures; it is not a successful page-performance measurement. Expired/non-loopback sessions are rejected.

Reuse the existing `e2e/specs/loading-performance.spec.ts` against the same live disposable services, without rebuilding them:

```sh
node scripts/performance/run-webkit.mjs artifacts/e2e/RUN/session.json artifacts/performance/webkit-loading
```

This adapter verifies the exact runner database container label and loopback port, then invokes the project's Playwright configuration for `webkit` and `mobile-webkit`, serially. It preserves the existing artifact reporters and fixtures. It neither creates accounts nor changes product data; the selected spec exercises only public artwork/loading behavior. The services remain owned and cleaned up by the original runner. These WebKit checks are functional normal/failure coverage, not a quantitative Safari performance comparison.

## Cropped first-screen image boundary

Written before the isolated Chromium fixture and collector correction. An image is first-screen visible only when its rectangle has a positive intersection with the viewport and every ancestor's clipping rectangle. Apply `overflow-x` and `overflow-y` independently for `hidden`, `clip`, `scroll`, and `auto`; an oversized atlas extending into the viewport must not count when its actual crop is below or beside the viewport. A nested crop that removes the remaining intersection must also exclude it. A genuinely visible crop whose image is not loaded/decoded must still block readiness.

The existing `data-page-image` gate remains mandatory even outside the first screen. Any actual `decode()` already started remains mandatory after the image moves out of view; pending or failed decode records must never produce successful timing metrics. The fixture holds and then releases real image responses, uses native Chromium rendering/decoding, and retains geometry, native readiness observations, assertions, and screenshots. It must neither modify application files nor introduce an application fallback.

```sh
node scripts/performance/validate-failures.mjs artifacts/e2e/RUN/session.json artifacts/performance/collector-clip-before --clip-only
node scripts/performance/validate-failures.mjs artifacts/e2e/RUN/session.json artifacts/performance/collector-clip-after --clip-only
```

`--clip-only` selects this lightweight synthetic-page browser contract explicitly; it does not claim the two real application fault checks ran. The full command without that flag runs all contracts. Keep before/after directories separate: an unfixed collector must fail the below-fold crop assertion, and the same fixture must pass after correction. Canonical live loopback session validation still applies, all page/image responses are intercepted, and held requests are released in `finally`.
