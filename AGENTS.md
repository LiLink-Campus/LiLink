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
