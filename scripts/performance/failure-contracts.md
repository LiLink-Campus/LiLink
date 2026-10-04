---
kind: reference
lang: en
---

# Performance collector browser failure contracts

## Independent homepage preview and high-definition timing

Declared before implementation: document-start observation must record first-screen readiness independently of `DOMContentLoaded`, application initialization, downloaded fonts, and complete-page readiness. `previewVisibleMs` requires a painted, visible homepage heading, both first-screen links, loaded render-blocking styles, and visible decoded artwork. Candidate artwork may be the inline CSS image on `[data-home-preview]`; a baseline without that element must wait for its visible decoded `img[data-page-image]`. Placeholder color, an empty or broken image, hidden/transparent ancestors, offscreen or clipped content, missing controls, and an inactive stylesheet must not satisfy it. The observer must retain the first qualifying animation frame even when a later page dependency stalls.

`heroHdReadyMs` independently requires the current responsive source of the hero's `img[data-page-image]` to decode and be actually visible. A decoded but hidden image is not ready, and a changed `currentSrc` requires fresh evidence. Preview timing must remain earlier and available when the high-definition response is held; high-definition timing must remain absent until release. Legacy strict content readiness, native paint metrics, complete error ledgers, and failed sample evidence remain separately reported.

Homepage reports keep relative paired statistics and additionally report independent candidate p75 gates: preview at most 2000 ms and native LCP at most 2500 ms. Each gate requires ten complete before/after pairs and no functional failures; insufficient pairs are INCONCLUSIVE, and exceeding a limit is FAIL. Local controlled profiles do not establish mainland or production speed.

Written before the fault runner. These are isolated end-to-end browser checks against the runner's disposable loopback Web/API/CDN. They make no business mutation and do not replace the paired performance comparison.

1. Hold the real About HD atlas response indefinitely. The actual heading and three decoded inline crop previews must render before the former eight-second fallback; the existing CSS entrance animation may finish independently. Observe `decode()` on the genuine held `img[data-page-image]` without replacing its source. The collector must still reject readiness while this HD image is incomplete and its decoder remains pending. Expected evidence: visible previews, the original HD URL, a pending HD decoder, and `sampleDocument` with no successful timing metrics plus a readiness timeout. A preview is never HD success. Release/abort the held route in `finally` and close only this test's isolated browser.
2. Hold one real `/about` RSC prefetch from the homepage before the click. Click the real homepage registration link. Only after the `/register` navigation request begins, abort the older `/about` request with `net::ERR_FAILED`. Registration must become normally visible, while the collector's complete journey ledger retains the older failure and reports `critical-resource-errors`. Expected evidence includes the trusted click, held-request start before it, abort trigger afterward, target observation, non-null click-to-ready metric and failed collection verdict. A timing slice alone must not hide the earlier request.

Run after the formal comparison finishes, with no other performance browser active:

```sh
node scripts/performance/validate-failures.mjs artifacts/e2e/RUN/session.json artifacts/performance/collector-failure-contracts
```

The command succeeds only when both deliberate application failures are rejected by the collector and the synthetic clipping/first-screen contracts pass. `failure-contracts.json` and screenshots retain the assertions and raw sample evidence. A successful fault check means the collector catches these failures; it is not a successful page-performance measurement. Expired/non-loopback sessions are rejected.

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

`--first-screen-only` runs the independent milestone and native-navigation synthetic browser contracts without the slower application fault checks. It holds genuine image and defer-script responses while recording preview visibility, checks empty/hidden first-screen failures, releases HD separately, and verifies trusted-click timing across a real document replacement. All responses stay within the isolated browser; no application file or data is modified.
