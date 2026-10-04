---
kind: reference
lang: en
---

# Immediate click performance contract

## Preview-first click extension

Declared before implementation: `--click-readiness preview` is the default and clicks as soon as the document-start observer records `previewVisibleMs`; it must not first wait for `DOMContentLoaded`, fonts, HD artwork, or full-page readiness. `--click-readiness complete` retains the earlier source-ready experiment. The source milestone, trusted-click timestamp, automation/scroll overhead, complete journey ledger, and target readiness are recorded independently. Navigation may replace the document when application JavaScript is not ready: preserve the trusted source click outside the page and measure target `timeOrigin + readiness` minus source `timeOrigin + click`. Native document navigation is valid, not an automatic failure. A missing trusted click, wrong destination, negative elapsed time, or a critical resource failure still fails. The lower registration CTA still needs scrolling; this disclosed overhead means it is not a first-screen CTA benchmark.

The browser observer is measurement code and remains separate from application scripts. Delayed/failed/disabled application-script business acceptance is a separate failure-injection experiment and must not be pooled with normal quantitative runs. Preserve every failed attempt and its partial observations; no retries may silently replace failed samples. A successful native navigation can cancel resources in the departed source document: retain those cancellations and exempt them only when CDP identifies the old document loader, cancellation happened after the trusted click, `canceled` is true with `net::ERR_ABORTED`, and no HTTP error is present. Do not exempt failed requests, destination errors, cancellations before the click, or resources without source-document identity.

This separate experiment covers homepage→About and homepage→registration when the homepage preview first becomes visible; `--click-readiness complete` selects the earlier fully-ready source milestone. It does not reuse the completed-document comparison's five-second native observation or two-second dwell.

In complete mode, source or destination artwork still decoding must prevent readiness. In preview mode the source may still be loading HD artwork; destination strict readiness is unchanged. A trusted source click must be preserved even across document navigation; all requests remain in the complete journey ledger, including failed prefetches started before the click; any page/critical resource error fails the sample. Source-ready→actual-click time must be recorded to expose scrolling and automation overhead. No LCP, FCP, CLS or INP claim is made from this short visit. The registration link requires a real scroll to the lower-page CTA; this time is disclosed rather than hidden.

Run only after other performance browsers have stopped, against the same live versioned disposable services:

```sh
node scripts/performance/early-click.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --before-label HEAD-SHA --after-label candidate-SHA --before-cdn-url http://127.0.0.1:61081 --rounds 10 --click-readiness preview --viewports desktop,mobile --profile mobile-pressure --output artifacts/performance/early-click-RUN
```

This creates 80 fresh-browser samples: ten pairs × two viewports × two destinations × two variants, serially with AB/BA order. The source preview observer, destination strict readiness observer, complete request ledger and paired-bootstrap statistical rules are shared with the primary comparison. This contract has exactly four click-latency comparison cells and does not repeat the separate menu-feedback checks. The raw schema records revision `immediate-click-preview-native-navigation-v2` (or `immediate-click-complete-native-navigation-v2`); imported measurement sources and hashes are archived in `harness-source`. Artifacts are independent of the full-document experiment and must not be pooled with it.

The same declared timing tolerance applies: the larger of 100 ms and 10% of baseline median. Ten complete pairs, median and p75 difference confidence bounds within tolerance, and no functional failure are required for a tolerance-based PASS. The result establishes only this controlled local Chromium scenario, not unchanged performance on every real device or mainland network.
