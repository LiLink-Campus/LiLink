# Web Agent Rules

These rules extend the root `AGENTS.md` for the Next.js application.

## UI Evidence

- For every user-visible frontend change, verify all affected elements and states in the Codex in-app browser at desktop and mobile viewport sizes, with isolated Playwright WebKit checks for Safari-engine compatibility. Include text wrapping, element widths, overflow, icons, dialogs, expanded states, interactions, and breakpoint boundaries; retain visual evidence for the in-app browser and WebKit checks. Changes to shared components must cover their affected consuming pages. Add or update Storybook stories when practical and tag representative regression states with `tags: ["smoke"]`.
- When reproducing a reference website, inspect its publicly loaded HTML, CSS, JavaScript, and relevant assets or requests before coding. Use confirmed implementation details where available; identify visual inferences when resources cannot be obtained.
- Keep checks and captures scoped to affected states. Follow [visual verification](../../docs/archive/2026-09-08-web-visual-verification.md) for commands; use the full smoke suite when the change warrants it.
- Post screenshots to a PR only when the task authorizes updating that PR. Otherwise, keep evidence local for review.
- Use synthetic fixtures. Keep real user data, email addresses, secrets, production URLs, and private records out of Storybook. Keep generated screenshots and `storybook-static` out of application commits.

## Visual Preferences

- Do not use colored vertical accent strips on card edges or inset side shadows for selected cards. Use subtle backgrounds, text emphasis, and uniform borders instead.

## Validation

- Run relevant web tests for logic changes and `npm run typecheck:web` for typed Next.js or component API changes.
- For Storybook story or configuration changes, use `npm run typecheck:storybook:web`; the application typecheck uses a separate configuration.
- Run `npm run lint:css -- <changed-css-paths>` for CSS edits; staged CSS is also checked by the Git pre-commit hook.
- Do not use the user's personal Chrome for routine testing. Use the in-app browser by default and isolated Playwright Chromium/WebKit when additional engine coverage is needed. Installed Chrome or Safari verification is optional and requires an explicit user request before accessing personal browsers. Engine-level checks do not establish installed-browser or physical iOS verification. Report the actual browser or engine, version when available, viewport, and states tested.
- If the in-app browser or an isolated engine check cannot run, complete available checks and report the missing coverage and blocker. Do not fall back to the user's personal browser automatically or claim an unperformed check passed.

## Automated End-to-End Regression

- Run repeatable end-to-end flows with Node.js and Playwright Test through `npm run test:e2e:web` or the scoped commands in `docs/e2e-testing.md`. Do not replay these flows with an AI browser agent.
- Keep the in-app browser for targeted visual review of new or changed UI. Automated Chromium/WebKit runs provide functional regression and screenshot evidence; report engine coverage accurately.
- Never point browser E2E fixtures at existing developer or production databases. Use the runner's disposable services and synthetic accounts. Do not automatically approve screenshot differences or hide flaky tests with retries.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
