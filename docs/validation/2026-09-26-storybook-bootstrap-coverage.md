# Storybook bootstrap coverage follow-up

The full verification after PRs 134 and 135 merged at `a229ecb8` found ten
uncovered TSX paths in `npm run audit:storybook:web`. Existing Storybook
interactions still passed (33 files, 302 tests). The audit failure is preserved
in the local full-verification artifacts.

## Scope

- Three existing page stories now render the actual home, profile, and account
  bootstrap components. Their fixtures are unchanged and shared with the new
  recovery story. This covers the new synchronization UI rather than bypassing it.
- One missing behavior is exercised through the real profile bootstrap: a failed
  authoritative read hides the stale editor, shows an error, then a retry displays
  the nickname returned by the API and clears the error.
- Each story resets account write metadata, and authentication fixtures match
  their page account. Initial testing caught stale metadata across stories and a
  mismatched default authentication account; both fixture issues were corrected.
- `HomeArtworkPreload` has no JSX or visible UI, so its unchanged implementation
  uses `.ts`. Its behavior remains covered by the homepage preload E2E.
- `MatchReveal`, its dedicated CSS, and `WechatContact` had no imports or callers
  even before these PRs. They are removed instead of receiving artificial stories.

The audit algorithm and exclusions remain unchanged. Its route coverage rule is
still dependency based; Storybook does not execute server loaders. The real API
and browser suites provide that separate validation.

## Validation

From the repository root with Node 24, npm 11, workspace dependencies and the
isolated Playwright Chromium installed:

```sh
npm run audit:storybook:web
npm run typecheck:storybook:web
npm run typecheck:web
npm run lint:web
npm run build:web
npm run test:storybook:web -- --run
```

Results: audit `missing: []` across 34 story files; type checks, lint and build
pass. The smoke-tagged Storybook suite passes 302 tests across 33 files. The
remaining ResponsiveMatrix story was run with an ignored copy of
`vitest.config.ts`, keeping `dirname` at the repository root and setting
`tags.include` to `[]`: one additional test passed. Together these cover all 303
stories without changing the production test filter.

Independent code review: APPROVE. Independent architecture review: CLEAR.
Local logs are under `artifacts/coverage-fix/`, including the original fixture
failures. Remote checks are tracked for the exact follow-up commit in its PR.
