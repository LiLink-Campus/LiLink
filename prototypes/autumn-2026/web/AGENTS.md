# Web Agent Rules

These rules extend the root `AGENTS.md` for the Next.js application.

## UI Evidence

- Every UI optimization must be verified on both desktop and mobile in a browser, including relevant open dialogs, expanded states, and breakpoint boundaries. Do not infer one layout works from checks on the other.

- For user-visible changes, verify the affected page or component states in a browser and retain visual evidence. Add or update Storybook stories when practical; tag representative regression states with `tags: ["smoke"]`.
- Keep checks and captures scoped to affected states. Follow [visual verification](../../../docs/guides/visual-verification.md) for commands; use the full smoke suite when the change warrants it.
- Post screenshots to a PR only when the task authorizes updating that PR. Otherwise, keep evidence local for review.
- Use synthetic fixtures. Keep real user data, email addresses, secrets, production URLs, and private records out of Storybook. Keep generated screenshots and `storybook-static` out of application commits.

## Validation

- Run relevant web tests for logic changes and `npm run typecheck:web` for typed Next.js or component API changes.
- Run `npm run lint:css -- <changed-css-paths>` for CSS edits; staged CSS is also checked by the Git pre-commit hook.
- If browser or visual checks cannot run locally, report the blocker and inspect available CI evidence; do not claim an unperformed check passed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
