---
kind: reference
lang: en
---

# Immediate click performance contract

This separate experiment covers homepage→About and homepage→registration when the homepage first becomes fully ready. It does not reuse the completed-document comparison's five-second native observation or two-second dwell.

Before implementation, the failure boundaries are: source or destination artwork still decoding must prevent readiness; a trusted click must be observed in the same document; all requests remain in the complete journey ledger, including failed prefetches started before the click; any page/critical resource error fails the sample. Source-ready→actual-click time must be recorded to expose scrolling and automation overhead. No LCP, FCP, CLS or INP claim is made from this short visit. The registration link requires a real scroll to the lower-page CTA; this time is disclosed rather than hidden.

Run only after other performance browsers have stopped, against the same live versioned disposable services:

```sh
node scripts/performance/early-click.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --before-label HEAD-SHA --after-label candidate-SHA --before-cdn-url http://127.0.0.1:61081 --rounds 10 --viewports desktop,mobile --profile mobile-pressure --output artifacts/performance/early-click-RUN
```

This creates 80 fresh-browser samples: ten pairs × two viewports × two destinations × two variants, serially with AB/BA order. The strict readiness observer, complete request ledger and paired-bootstrap statistical rules are shared with the primary comparison. This contract has exactly four click-latency comparison cells and does not repeat the separate menu-feedback checks. The raw schema records revision `immediate-click-after-source-ready-v1`; imported measurement sources and hashes are archived in `harness-source`. Artifacts are independent of the full-document experiment and must not be pooled with it.

The same declared timing tolerance applies: the larger of 100 ms and 10% of baseline median. Ten complete pairs, median and p75 difference confidence bounds within tolerance, and no functional failure are required for a tolerance-based PASS. The result establishes only this controlled local Chromium scenario, not unchanged performance on every real device or mainland network.
