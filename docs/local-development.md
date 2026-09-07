# Local Development

Use Node 24 LTS (the version is pinned in `.node-version`), npm 11, and Git 2.54+ for config-based hooks. The pinned toolchain is Node 24.20.0 with bundled npm 11.19.0; `.nvmrc`, CI, and both API Dockerfiles use the same Node release. Start Docker before the local infrastructure.

From the repository root:

1. Install dependencies with `npm ci`.
2. Install Git hooks with `npm run hooks:install`; verify them with `npm run hooks:audit`.
3. If `apps/api/.env` is missing, copy `apps/api/.env.example` and configure local development values. Do not overwrite an existing environment file or use production credentials.
4. Start PostgreSQL and Mailpit with `npm run infra:up`.
5. Run migrations with `npm run db:migrate` and seed defaults with `npm run db:seed-defaults`.
6. Bootstrap the local admin from `apps/api` with `node scripts/bootstrap-admin.mjs` when needed.
7. Start the shared watcher, API, and web app with `npm run dev`.

The web app runs on port 3000 and the API on port 4000. The web build wrapper defaults `NEXT_PUBLIC_API_BASE_URL` to `http://localhost:4000/v1` in development. Mailpit receives local SMTP on port 2525; inspect mail at `http://localhost:8025`.

`npm run dev` builds the shared workspace first. A failed shared build prevents the app servers from starting. API unit tests do not need a database; e2e tests require PostgreSQL with migrations applied.

Use `npm run infra:down` to stop local infrastructure. Production uses a separate compose file and entrypoint; see [production operations](production-release-flow.md).
