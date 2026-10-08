#!/usr/bin/env bash
set -euo pipefail
# Fixed regression collection; no path selection or event-dependent profiles.
npm run build:shared
npm run db:generate
mkdir -p artifacts/test-results
(cd packages/shared && node --test --test-reporter=tap) | tee artifacts/test-results/shared.tap
grep -Eq '^# tests [1-9]' artifacts/test-results/shared.tap
if grep -Eq '^# (skipped|todo|cancelled) [1-9]' artifacts/test-results/shared.tap; then exit 1; fi
npm exec --workspace api -- jest --runInBand --json --outputFile=../../artifacts/test-results/api-unit.json
npm run test --workspace web -- --reporter=default --reporter=json --outputFile=../../artifacts/test-results/web.json
node --test --test-reporter=tap scripts/*.test.mjs scripts/hooks/*.test.mjs scripts/e2e/*.test.mjs scripts/images/*.test.mjs scripts/release/*.test.mjs | tee artifacts/test-results/tooling.tap
grep -Eq '^# tests [1-9]' artifacts/test-results/tooling.tap
if grep -Eq '^# (skipped|todo|cancelled) [1-9]' artifacts/test-results/tooling.tap; then exit 1; fi
node --input-type=module -e 'import fs from "node:fs"; for (const name of ["api-unit", "web"]) { const r=JSON.parse(fs.readFileSync(`artifacts/test-results/${name}.json`)); if (!r.success || !r.numPassedTests || r.numPendingTests || r.numTodoTests) throw Error(`${name}: empty or skipped regression`); }'
node scripts/usage/verify-budget.mjs artifacts/usage-contracts/budget
node scripts/usage/verify-isr-write-budget.mjs artifacts/usage-contracts/isr
node scripts/usage/verify-browser-comparison.mjs artifacts/usage-contracts/comparison
node scripts/usage/verify-browser-capture.mjs artifacts/usage-contracts/capture
npm run docs:check
npm run docs:verify
npm run docs:hooks:verify
npm run docs:tooling:verify
npm exec --workspace api -- tsc -p tsconfig.typecheck.json
npm run typecheck --workspace web
npx tsc -p e2e/tsconfig.json
npm run lint:shared
npm run lint:web
npm exec --workspace api -- eslint '{src,apps,libs,test}/**/*.ts'
npm exec --workspace api -- nest build
# The Replay SDK captures native timers in an iframe and conflicts with browser fake clocks.
# Keep its real compiled integration in a separate Web build, with the same API dist.
node scripts/e2e/run.mjs --ci &
suite_pid=$!
trap 'kill -TERM "$suite_pid"; wait "$suite_pid"; exit 130' INT TERM
wait "$suite_pid"
trap - INT TERM
exec node scripts/e2e/run.mjs --sentry-tracing --reuse-api-build --project=chromium
