# LiLink Agent Rules

This file contains team-shared guidance for agents working in this repository. Keep personal machine setup, local secrets, temporary workflow notes, and one-off overrides in `AGENTS.override.md`, which is ignored by Git.

## Scope

These instructions apply to the entire repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Repository Structure

- `apps/api` contains the NestJS API and Prisma schema.
- `apps/web` contains the Next.js web application.
- `packages/shared` contains shared TypeScript code used by the app workspaces.
- Keep generated output, dependencies, local environment files, logs, and tool scratch files out of Git.

## Development

- Prefer existing workspace scripts in `package.json` over ad-hoc commands.
- Build `@lilink/shared` before running app builds that depend on shared output.
- Run Prisma generate after schema or Prisma client dependency changes.
- Install local Git 2.54+ config-based lint hooks with `npm run hooks:install`. The pre-commit hook runs `npm run lint:staged`; the pre-push hook runs `npm run lint:pre-push`, which runs `npm run lint && git diff --exit-code`.
- Do not silently create or change environment files with real credentials.
- Never print secret values from `.env` files, logs, shell output, or CI output.

## Hook Management

- Maintain hook definitions only in `scripts/hooks/registry.mjs`.
- Treat `.codex/hooks.json`, `.cursor/hooks.json`, and `.claude/settings.json` as generated adapter files for Codex, Cursor, and Claude Code. Do not edit them directly; run `npm run hooks:sync` after registry changes.
- To register a new hook, add it to `scripts/hooks/registry.mjs` (a `GIT_HOOK_CONFIGS` entry for a Git hook, or an `AGENT_HOOK_CONFIG_FILES` entry for an agent adapter), then run `npm run hooks:sync` (or `npm run hooks:install`) and commit the regenerated files.
- `.claude/settings.json` is generated and committed; put personal Claude settings in `.claude/settings.local.json` (gitignored), not in `settings.json`.
- Run `npm run hooks:install` to install Git config-based hooks and regenerate the Codex/Cursor/Claude hook adapters.
- Run `npm run hooks:audit` when reviewing hook changes to confirm Git, Codex, Cursor, and Claude hook configuration still matches the registry.

## Skills

- Personal agent skills live under `.agent-local/skills/<name>/SKILL.md` and are gitignored — they are per-developer, not team-shared.
- Run `npm run skills:link` to create project-level symlinks (`.codex/skills/<name>`, `.claude/skills/<name>`) so Codex and Claude Code auto-discover them from the single source. The command is idempotent and is a no-op when `.agent-local/skills` is absent.
- Cursor has no SKILL.md system; it reads rules from `AGENTS.md` and `.cursor/rules`.

## Validation

- Choose checks that match the changed surface area.
- For shared package changes, run the shared build or tests.
- For API changes, run the API build and relevant tests when available.
- For web changes, run typecheck/build checks that cover the affected code.
- Dockerfile changes should be validated with a Docker build when Docker is available.

## CI

- In this repository, "CI" means every GitHub Actions workflow triggered by `push`, `pull_request`, or manual dispatch.
- CI includes lint, build, typecheck, generated-file checks, and tests.
- Local success does not replace CI success after a commit, push, merge, or PR update.
- When reporting completion after remote updates, include the latest relevant CI status for the exact commit when it is available.

## Git Hygiene

- Keep commits focused on the requested change.
- Do not commit local-only files such as `.env`, `.env.*`, `AGENTS.override.md`, `.agent-local/`, `.codex/skills/`, `.claude/skills/`, `.claude/settings.local.json`, build output, dependency folders, or logs.
- Before staging, inspect `git status --short` and avoid adding unrelated untracked files.
- Comments and docstrings in code should be concise and written in English.

## Production Container Operations

Local Docker and production Docker are intentionally separate:

- `docker-compose.local.yml` is local-only: PostgreSQL, Mailpit, and the optional local API container.
- `docker-compose.prod.yml` is production-only: the `api` service, `apps/api/Dockerfile.prod`, and no local PostgreSQL service.
- `apps/api/Dockerfile.local` is for optional local API containers. `apps/api/Dockerfile.prod` is for production image builds.

The prod `api` service must not expose secrets through compose `environment:` or `env_file:`. `docker-compose.prod.yml` mounts `/home/admin/lilink/.env` as the Docker secret `api_env`, and `apps/api/scripts/production-entrypoint.mjs` parses it inside the container before running Prisma, bootstrap, and the API process. Consequences agents must remember:

- `docker inspect lilink-api` and `docker exec lilink-api env` should not show `DATABASE_URL`, JWT secrets, SMTP secrets, or other values from `.env`. The running Node process has them; new exec shells start without them. This is by design, not a misconfiguration.
- Ad-hoc Prisma CLI invocations inside the container must load the production env secret through the production entrypoint helper. Example:

  ```sh
  docker exec lilink-api node scripts/production-entrypoint.mjs npx prisma migrate status
  ```

- `apps/api/prisma/schema.prisma` no longer declares `url = env("DATABASE_URL")` because the API uses the Prisma 7 driver adapter (`@prisma/adapter-pg`) and reads the connection string at runtime via `apps/api/src/common/prisma/client.ts`. Treat any reintroduction of a hard-coded `url` in the schema as a regression.
- Production source map uploads use a BuildKit secret named `sentry_auth_token`; never pass `SENTRY_AUTH_TOKEN` as a Docker build arg or runtime environment variable.
- Never echo `DATABASE_URL`, `DB_PASSWORD`, `SENTRY_AUTH_TOKEN`, or other secrets to logs, terminals, or commit messages.

## Cursor Cloud specific instructions

### Prerequisites

Docker must be running before starting dev services. Start the daemon with:

```sh
sudo dockerd &>/tmp/dockerd.log &
sudo chmod 666 /var/run/docker.sock
```

### Starting the development environment

1. Start infrastructure (PostgreSQL + Mailpit): `npm run infra:up`
2. Copy env file if missing: `cp apps/api/.env.example apps/api/.env` (then fill in dev secrets — see `.env.example` for field descriptions).
3. Run migrations: `npm run db:migrate`
4. Seed defaults (schools, questionnaire, cycle): `npm run db:seed-defaults`
5. Bootstrap admin: `cd apps/api && node scripts/bootstrap-admin.mjs`
6. Start all dev servers: `npm run dev` (shared watch + API on :4000 + Web on :3000)

### Gotchas

- The API lint script (`npm run lint:api`) uses `--fix` and may modify files. Always check `git diff` after running lint.
- `npm run dev` runs `build:shared` first, then starts the shared package in watch mode alongside the API and web. If the shared build fails, all downstream servers will not start.
- The web app needs `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:4000/v1` in dev mode via the build script wrapper).
- API e2e tests require a running PostgreSQL instance with migrations applied. Unit tests do not require a running DB.
- Docker in this Cloud VM requires `fuse-overlayfs` storage driver and `iptables-legacy`. These are configured in `/etc/docker/daemon.json` and via `update-alternatives`.
- Mailpit catches all outgoing SMTP on port 2525; view captured emails at http://localhost:8025.
