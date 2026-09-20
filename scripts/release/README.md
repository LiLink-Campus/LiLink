# Isolated release checks

These scripts reject the production database and API. Local credentials and target manifests belong under the ignored `artifacts/questionnaire-release-20260920/` directory. Validate Neon project, branch and compute metadata before writing a target manifest. Never commit connection strings, keys, backups or runtime logs.

`node scripts/release/local-rehearsal.mjs start` builds the committed API using the production Dockerfile, starts task-labelled containers with 2 CPUs / 3.5 GiB memory and Mailpit, and exposes the authenticated proxy on `http://127.0.0.1:4080`. It requires the verified synthetic target and existing restricted credential files. Run `matching`, `evidence`, then `stop` as separate subcommands. Stop removes only containers and the network carrying this task's label; it retains logs and database evidence. On Apple Silicon this is Linux arm64, so record the architecture and do not equate its throughput with production amd64. The GitHub rehearsal is now manual to avoid starting an unused remote API on every push.

Before a matching replay, previous `release_worker_*` cycles are retained as DRAFT and pending synthetic match mail is retired. This prevents abandoned cycles from being scheduled and excludes them from the first-cycle/streak window; their existing pair exclusions are retained. The three original synthetic history cycles remain unchanged. Each result reports its actual candidate count. Preparation over 60 seconds fails the workflow after all business assertions have been checked.

Each matching stage waits for every outbox row to become SENT and reconciles the new Mailpit receipts against all expected recipients before advancing. A repeated tick must not reveal the cycle again. The API logs reveal transaction and snapshot durations separately. The preload observer reports connection-pool occupancy, checkout wait and query round-trip durations without logging SQL text, parameters or credentials.

`database.mjs` provides the guarded audit, encrypted backup, migration and restore rehearsal. `seed-load.mjs` requires the dedicated synthetic Neon project and creates 2,000 synthetic users. `matching-rehearsal.mjs` exercises the running API at 500, 1,000 and 2,000 participants and verifies matching, introduction and snapshot counts. Its output must be captured with Bash `set -euo pipefail` when piped through `tee`.

`load.js` requires **absolute** `TARGET_FILE`, `ACCESS_FILE`, `QUESTION_FIXTURE` and `SUMMARY_FILE` paths, plus the API's exact `RELEASE_SHA`. It verifies the remote identity before generating traffic. Use the official k6 binary. Keep normal production throttle settings.

| Mode | Arrival unit | Work per iteration |
| --- | --- | --- |
| `read` (default) | API requests | One of the four homepage APIs, equal weighting |
| `home` | Users entering the homepage | Four concurrent APIs for the same user; all four must succeed |
| `match` | Users entering the match page directly | Bootstrap API with the expected user and dashboard |
| `mixed` | Business operations | 70% reads, 20% questionnaire submit + readback, 10% opt-in + readback; 1.3 API requests per iteration on average |

Use `MODE=home LOAD_RATE=500 RATE_TIME_UNIT=1m LOAD_DURATION_SECONDS=120` to model 500 homepage entrants per minute (about 33.3 API requests/s), and repeat with 1,000 entrants/minute. Direct match entry has a different request count. These are API flow measurements; they do not replace browser rendering or Vercel SSR tests.

For protocol capacity, use `MODE=read RATE_TIME_UNIT=1s LOAD_RATE=33` (then 67 and 100). The script permits at most 200 planned API requests/s and 1,800 seconds per run. `MODE=mixed LOAD_RATE=100` means about 130 API requests/s; use the reported `expectedRequests` rather than calling it 100 requests/s.

Every result reports planned iterations/API requests, attempted and successful API requests, completed business iterations, and distinct successful fixture users on their first pass. `home` and `match` also enforce complete API flow latency. Raw `read` users are users with one successful fixture request, not completed browser visits. Unexpected 429 responses and dropped iterations fail the run. The first pass user count is a conservative lower bound after the 2,000 fixtures are reused.

Reconcile request counts and route ratios with `requests.jsonl` from the isolated proxy. Compare them only over the same test time interval, excluding identity checks and other rehearsal steps. Vercel SSR requests require API-side logs because the browser Network panel does not contain those calls.

`benchmark-worker.mjs` runs only the CPU solver and checks pair uniqueness. Its runtime and memory numbers are not end-to-end capacity evidence. Record image SHA, platform, CPU/memory limits, Neon settings, cold/warm state, database wait/lock metrics and outbox completion separately before approving a production release.

The Mac runner also accepts the empty synthetic database `lilink_load_20260921` on the isolated restore-rehearsal branch, using only its dedicated `release_mac_20260921` role. `targets.mjs` fixes the allowed project, branch, host, database and role; the copied `neondb` on that branch is explicitly rejected. Set absolute `RELEASE_TARGET_FILE` and `RELEASE_DATABASE_FILE` paths to the corresponding restricted manifest and connection file. The Mac proxy includes the database in its identity, and k6 checks that identity before generating traffic. This database has no production user rows.

For read/write capacity checks after deterministic matching, restart the local runner with `RELEASE_NORMAL_JOBS=true` to include ordinary cron and outbox activity. Manual matching rejects this mode to avoid the scheduler consuming its expected tick. Mail remains restricted to Mailpit in both modes.

`RELEASE_DATABASE_CONNECTION_LIMIT` sets the isolated API pool size (default 20, bounded to 1–80). Record this setting beside each result. Check the target database's live connection budget before increasing it, including additional application processes and operational connections. A test override does not change production settings.
