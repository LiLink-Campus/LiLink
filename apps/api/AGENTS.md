# API Agent Rules

These rules extend the root `AGENTS.md` for the NestJS API and Prisma schema.

## Prisma

- Run `npm run db:generate` after schema or Prisma client dependency changes.
- Keep database configuration in `src/common/prisma/client.ts` through the Prisma 7 driver adapter. Do not reintroduce `url = env("DATABASE_URL")` in `prisma/schema.prisma`.

## Validation

- For API source or DTO changes, run `npm run typecheck:api` and relevant API Jest suites.
- For migrations or database behavior changes, also run relevant e2e tests with PostgreSQL and migrations available. If blocked, report the attempted command and missing prerequisite.
