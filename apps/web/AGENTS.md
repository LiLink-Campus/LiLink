# Web Agent Rules

These rules extend the repository root `AGENTS.md` for `apps/web`.

## Scope

These instructions apply to the Next.js web application under `apps/web`.

## UI Evidence

- For user-visible UI changes, update or add Storybook stories for the affected component or page state when practical.
- Mark representative review states with `tags: ["smoke"]` so Storybook smoke tests and screenshot capture include them.
- Generate visual evidence for UI PRs with `npm run visual:storybook:web`, or rely on the `Storybook Visual Evidence` workflow when running in CI: it uploads the screenshot artifact, pushes screenshots to a `storybook-evidence/pr-<number>` branch, and posts/updates a sticky PR comment linking each capture.
- Do not commit generated screenshots or `storybook-static`; use GitHub Actions artifacts or PR comments for screenshot evidence.
- Keep screenshot fixtures synthetic. Do not expose real user data, email addresses, secrets, production URLs, or private records in Storybook states.

## Validation

- For pure web logic changes, run `npm run test --workspace web`.
- For typed Next.js or component API changes, run `npm run typecheck:web`.
- For Storybook-covered UI changes, run `npm run visual:storybook:web` when local browser dependencies are available.
- If a visual check cannot run locally, report the exact blocker and confirm the GitHub Actions artifact instead.
