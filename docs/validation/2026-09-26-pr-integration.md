# PR 134 / 135 integration validation

## Scope and design

PR 134 was merged first at `513ea1002b907d0f31f4827b3444265b5bec4e02`.
PR 135 retains the split account services and profile modules from that change,
while moving its write ownership, read refresh, VIP status, and match estimates
into those module boundaries.

Questionnaire acknowledgements now share the existing 15-second autosave deadline.
The write tracker is always released when a request completes or times out. A
timeout does not imply that the server rejected the write: a returning profile
reader fetches authoritative state after the tracked request finishes. In-flight
autosaves keep their bounded lifetime across navigation.

The school exclusion component explicitly projects the two supported exclusion
fields before requesting a match estimate. Its props can contain the full profile
form at runtime; passing that object directly violates the API whitelist.

## Reproducible validation

Prerequisites: Node 24, npm 11, installed workspace dependencies, and local Docker.
Run commands from the repository root. The E2E runner creates and destroys its own
PostgreSQL and Mailpit containers, with synthetic accounts and a loopback-only
`lilink_e2e_*` database. Do not substitute a development or production database.

```sh
npm run db:generate
npm run typecheck:api
npm run typecheck:web
npm run typecheck:storybook:web
npx tsc -p e2e/tsconfig.json
npm run lint
npm run test --workspace api -- --runInBand --testPathPatterns='page-bootstrap.controller|dashboard-snapshot|account-profile|contact-preferences|match-report|questionnaire-attention|questionnaire-read'
node scripts/e2e/run.mjs e2e/specs/profile-boundaries.spec.ts e2e/specs/navigation-performance.spec.ts e2e/specs/profile-confirmation-timeout.spec.ts e2e/specs/read-refresh.spec.ts e2e/specs/contact-navigation.spec.ts e2e/specs/performance-contracts.spec.ts --project=chromium --project=mobile-webkit
node scripts/e2e/run.mjs e2e/specs/profile-boundaries.spec.ts e2e/specs/profile-confirmation-timeout.spec.ts --project=chromium --project=mobile-webkit
```

Pre-merge results:

- Type checks and lint passed; web lint reported four pre-existing warnings.
- Targeted API checks passed: 9 suites, 33 tests.
- Navigation/read/write checks passed: 46 tests, run `f57aaaa564b8`.
- The strengthened school-estimate assertion first reproduced the integration
  defect with an actual HTTP 400, run `74c145465912`.
- After projecting the supported fields, all 10 boundary/recovery tests passed,
  run `6688a2a58f2d`, in Chromium desktop and mobile WebKit.
- The recovery case holds a response after the real API has committed the
  acknowledgement. It verifies an editable profile, a fresh bootstrap read, and
  persisted acknowledgement before releasing the held response. JSON assertions
  and screenshots are attached to the Playwright result.
- Codex in-app browser inspection passed at 1280x800 and 390x844 using the isolated
  preview run `e790e717bbc7`. The profile, VIP exclusion control, and probability
  hint were visible; mobile document width equalled the viewport width (390).
- Independent code review: APPROVE after the estimate projection fix. Independent
  architecture review: CLEAR for integration, with the release constraint below.

Local logs and IAB screenshots are under `artifacts/pr135-integration/`; E2E
reports, result JSON, and screenshots are under `artifacts/e2e/<run-id>/`.
These generated files are intentionally not committed.

## Remaining release constraint

The home bootstrap response changes in PR 135 require coordinated API/Web release
and rollback, as already documented by that PR. This integration does not deploy
either service. Pre-merge checks do not replace the full test pass on the final
main commit after both PRs merge; that pass is recorded separately.
