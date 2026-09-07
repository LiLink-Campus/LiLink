# LiLink Agent Rules

Shared project instructions live in `AGENTS.md`; module-specific rules live in `apps/api/AGENTS.md` and `apps/web/AGENTS.md`.

## Project and Development

- `apps/api`: NestJS API and Prisma; `apps/web`: Next.js; `packages/shared`: shared TypeScript.
- Use the workspace scripts in `package.json`. Build `@lilink/shared` before dependent app builds; the root dev and build scripts handle this ordering.
- Use Node 24 LTS (see `.node-version`), npm 11, and Git 2.54+ for config-based hooks. See [local development](docs/local-development.md) for setup and service commands.
- Keep Git hook definitions in `scripts/hooks/registry.mjs`. Run `npm run hooks:install` to install them and `npm run hooks:audit` after hook changes. Pre-commit checks staged files; pre-push runs lint and rejects resulting tracked changes.
- Reusable project skills, when needed, use `.agents/skills/<name>/SKILL.md` directly.

## Validation

- Match checks to the changed behavior: shared build/tests, API typecheck and relevant Jest suites, or web typecheck/tests and UI evidence. Validate Dockerfile changes with a Docker build when Docker is available.
- Once relevant checks pass, repeat or broaden them only for new changes, failures, or unresolved concerns. Report checks that could not run and their blockers.
- `npm run lint:api` uses `--fix`; inspect the diff afterward.
- CI means every applicable GitHub Actions workflow triggered by push, pull request, or manual dispatch. Local results do not replace CI; after remote updates, report the latest available CI results for the exact commit.

## Changes and Data

- Inspect Git status before staging and keep changes scoped to the request. Preserve unrelated local work.
- Keep credentials, local overrides, dependencies, generated output, logs, and scratch files out of Git. Never print secrets or silently create or change credential-bearing environment files.
- Keep code comments and docstrings concise and in English.

## Production Constraints

- Local infrastructure uses `docker-compose.local.yml`; production uses `docker-compose.prod.yml` and `apps/api/Dockerfile.prod`, without local PostgreSQL.
- Production settings are mounted as Docker secret `api_env` and loaded by `apps/api/scripts/production-entrypoint.mjs`. Do not expose them through compose `environment` or `env_file`; fresh `docker exec` shells intentionally do not inherit them.
- Sentry source map uploads use the BuildKit secret `sentry_auth_token`, never a build argument or runtime environment variable.
- Read [production operations](docs/production-release-flow.md) before deployment or ad-hoc commands in the production container.
