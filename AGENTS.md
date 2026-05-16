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
- Do not commit local-only files such as `.env`, `.env.*`, `AGENTS.override.md`, `.codex-local/`, build output, dependency folders, or logs.
- Before staging, inspect `git status --short` and avoid adding unrelated untracked files.
- Comments and docstrings in code should be concise and written in English.

## Production Container Operations

The prod `api` service in `docker-compose.yml` intentionally omits `DATABASE_URL` from the compose `environment:` block. The entrypoint assembles the URL inline and `export`s it only for the Node process, so `docker inspect` cannot leak the database password. Consequences agents must remember:

- `docker exec lilink-api env` does not show `DATABASE_URL`. The running Node process has it; new exec shells start without it. This is by design, not a misconfiguration.
- Ad-hoc Prisma CLI invocations inside the container must rebuild the URL from the parts that *are* in the env (e.g. `DB_PASSWORD`). Example:

  ```sh
  docker exec lilink-api sh -c '
    export DATABASE_URL="postgresql://lilink:$DB_PASSWORD@postgres:5432/lilink?schema=public" &&
    npx prisma migrate status
  '
  ```

- `apps/api/prisma/schema.prisma` no longer declares `url = env("DATABASE_URL")` because the API uses the Prisma 7 driver adapter (`@prisma/adapter-pg`) and reads the connection string at runtime via `apps/api/src/common/prisma/client.ts`. Treat any reintroduction of a hard-coded `url` in the schema as a regression.
- Never echo `DATABASE_URL`, `DB_PASSWORD`, or other secrets to logs, terminals, or commit messages.

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
