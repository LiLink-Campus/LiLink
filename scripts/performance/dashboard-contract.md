---
kind: reference
---

# Dashboard paired measurement

See the [performance tooling entry point](README.md) for other measurement contracts.

## Predeclared boundaries and gates

This collector measures the same synthetic account against two isolated production
Web builds sharing one disposable API. It rejects expired or non-loopback sessions.
No credentials, headers, account IDs, questionnaire answers or URL query strings
are written to artifacts. Functional assertions must pass before interpreting timing.

- Real browser time is used throughout; no clock acceleration or CPU emulation.
- Ten paired rounds per viewport alternate before/after order in fresh contexts.
- Before timing, each variant opens the nickname through the real directory and
  saves the same preparation value. Measured typing then changes that snapshot;
  returning to an already saved value correctly emits no new autosave request.
- Input response is trusted input event to next animation frame with the updated
  control value. Navigation response is trusted button click to a visible next
  question. These custom measurements are not field INP.
- Each sequence contributes its 18 input frames' p75 as one paired input sample;
  the report gives the p75 of the ten sequence summaries. Each navigation sample
  is one click. Resampling preserves whole paired sequences, not individual keys.
- Input and navigation p75 must not regress by more than the greater of 20 ms and
  10% of the baseline p75. Paired bootstrap upper confidence bounds beyond that
  threshold are INCONCLUSIVE; lower bounds beyond it are FAIL.
- Long-task counts/durations and repeated reader attribute writes are diagnostics,
  not assertions about hook structure or guaranteed CPU/energy savings.
- The residency ledger observes 31 seconds visible, 61 seconds simulated hidden,
  then one visibility event plus a focus event after the fast response can settle,
  and a separate later hide/resume. Started, cancelled and finished requests remain
  distinct. Simulation does not establish physical background energy usage.
- Browser cancellation does not prove SQL cancellation. Local request reduction
  does not establish production billing changes, Vercel metrics or real iOS behavior.
- Missing metrics, functional failure, fewer than ten complete pairs and timing
  improvements within measurement noise cannot support definite speed claims.

## Reproduce

Start the candidate through `node scripts/e2e/run.mjs --serve --serve-minutes=90
--extra-client-origin=http://127.0.0.1:61082`. Start the frozen baseline with
`node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61082
b75ed0fdb76fff87bd611a4a9ba42e191c2cb0ae`. Then run:

```sh
node scripts/performance/dashboard-compare.mjs artifacts/performance/baseline-RUN/comparison-session.json artifacts/performance/dashboard-147
```

Regenerate interpretation from sanitized raw evidence:

```sh
node scripts/performance/dashboard-compare.mjs --summarize artifacts/performance/dashboard-147/raw.json
```

Use `--inputs-only` to repeat only the twenty input/navigation pairs when that
instrumentation changes. The same timing gates apply, and each sequence must have
exactly eighteen measured frames. This mode produces no residency evidence;
report an independently captured residency ledger with its own tool digest and
scope. Do not pool input pairs from different collector versions.

Raw JSON records source identifiers, browser version, viewport, every paired
sample, residency request events, failures and screenshots. The candidate source
digest is calculated from its frozen runner workspace before sampling; baseline
source is the explicit Git revision. Canonical runner and comparison-session paths
are validated before creating an account or sending disposable SMTP mail.
