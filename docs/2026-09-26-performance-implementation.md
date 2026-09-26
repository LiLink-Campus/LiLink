# Performance implementation and acceptance

Baseline: `8c4695910ead6ea81385d96f930f1f301097697c`. Branch: `codex/loading-performance-audit`.

## Product contract

- Keep the complete-page reveal after first-screen artwork is decoded, including the existing bounded failure fallback. Improve preparation and transfer without showing bare content first.
- Preserve account isolation, live authorization, questionnaire eligibility, campaign lifecycle, matching priorities, privacy restrictions and redemption correctness.
- Keep confirmed content during background reads. Superseded reads cannot update the current view; cancelling a write does not undo it.
- Use existing dependencies and existing bounded workers/caches. Do not add a generic data framework, broad offline cache or speculative infrastructure.

## Boundaries and sequence

1. Frontend read lifecycle: registration schools, admin collections and independent statistics. One request identity per query, initial loading distinct from background refresh.
2. Backend reads: completed-grant fast path; shared campaign lock for grants versus exclusive lifecycle changes, per-user idempotency; missing dashboard snapshots repaired only for requesting users under existing privacy locks.
3. Home read model: move existing progress rules into shared domain code, return the same summary from the API, reuse request-scoped verified identity.
4. Client work: bounded/cancellable reads, visible-only non-overlapping polling and server-confirmed mutation states. Verify existing navigation before adding private prefetch; invalidate related read models after successful writes without resetting the active editor.
5. Resources and scale: preserve image reveal, lossless modern image encoding, early resource discovery; coupon history pagination; independent estimate queries. Benchmark matching before changing candidate generation or the solver.
6. Evidence: align load scripts with page bootstrap, retain isolated-target checks, add Playwright scenarios for user-visible waiting and emit repeatable sanitized artifacts.

## Failure scenarios to lock before implementation

- School refresh stalls/fails after a successful load: selection and valid submission remain available; server still rejects revoked schools.
- Slow old admin query finishes after a new query: latest query and its loading/error state win.
- One statistics request fails: independent successful statistics remain visible.
- A completed reward read competes with campaign publication; concurrent first grants do not duplicate coupons or grant after campaign end.
- One missing personal snapshot must not rebuild unrelated users; report/deactivation races never expose blocked contact details.
- Home summary matches existing progress, draft and updated-question rules without returning complete definitions or saved answers.
- Hidden tabs and slow polling do not accumulate requests; VIP expiry is enforced even when refresh fails.
- Image decode is delayed: page remains visually gated until ready; decoded artwork is identical after optimization.
- Coupon history pages are stable, bounded and account-scoped; current coupons are not dropped during history navigation.
- Prefetch and back navigation preserve current authorization and mutation invalidation, without requesting redemption secrets or triggering coupon grants.

Existing behavior suites are reused. New coverage is written as browser/API integration scenarios before the relevant implementation, not post-hoc unit tests.

## Verification

Use Node 24/npm 11, existing project scripts and the disposable `scripts/e2e/run.mjs` environment. No existing development/production database is a test target. Artifacts record commands, SHA, runtime, viewport, synthetic data prerequisites, assertions, timing and screenshots without credentials or private payloads. API acceptance uses the runner's isolated `--api` mode. Normal-motion and image-wait scenarios supplement, rather than replace, stable reduced-motion regression.

Implementation and final evidence are recorded in the validation report after execution. The subsequent PR request authorizes committing and pushing these changes; deployment remains outside this task.
