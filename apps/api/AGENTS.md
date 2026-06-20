# API Agent Rules

These rules extend the repository root `AGENTS.md` for `apps/api`.

## Scope

These instructions apply to the NestJS API and Prisma schema under `apps/api`.

## Prisma

- Run `npm run db:generate` after Prisma schema changes or Prisma client dependency changes.
- Do not reintroduce `url = env("DATABASE_URL")` in `apps/api/prisma/schema.prisma`; runtime database configuration is handled through the Prisma driver adapter.
- Do not print database URLs, JWT secrets, SMTP credentials, Sentry tokens, or other environment secrets.

## Validation

- For API source or DTO changes, run `npm run typecheck:api` and the relevant API Jest suites.
- For Prisma migrations or database behavior changes, run the relevant unit tests and e2e tests when PostgreSQL is available.
- If e2e tests cannot run because local Postgres or Docker is unavailable, state that explicitly with the command attempted and the blocker.
