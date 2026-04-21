#!/usr/bin/env bash
# Spin up an isolated staging stack on the same VPS so stage-3 register/code
# load tests never touch production data or send real emails.
#
# Layout:
#   - lilink-mailpit-stg : SMTP sink, web UI on 127.0.0.1:8025
#   - lilink-api-stg     : same image as prod, on 127.0.0.1:4001
#   - lilink_stg         : new database inside the existing lilink-postgres
#
# Reuses the production lilink_default network (so api-stg can reach
# lilink-postgres by service name).
#
# Tear down with loadtest/staging-down.sh.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
readonly ENV_FILE="${REPO_ROOT}/apps/api/.env"
readonly NETWORK="lilink_default"
readonly STG_DB="lilink_stg"
readonly STG_API_PORT="${STG_API_PORT:-4001}"
readonly STG_MAILPIT_UI_PORT="${STG_MAILPIT_UI_PORT:-8025}"
readonly STG_API_NAME="lilink-api-stg"
readonly STG_MAILPIT_NAME="lilink-mailpit-stg"

DB_PASSWORD="${DB_PASSWORD:-$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | sed 's/^[^=]*=//' || true)}"
DB_PASSWORD="${DB_PASSWORD:-lilink}"

echo "[staging] Ensuring database $STG_DB exists ..."
docker exec lilink-postgres psql -U lilink -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$STG_DB'" \
  | grep -q 1 \
  || docker exec lilink-postgres psql -U lilink -c "CREATE DATABASE $STG_DB OWNER lilink"

echo "[staging] (re)launching $STG_MAILPIT_NAME ..."
docker rm -f "$STG_MAILPIT_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$STG_MAILPIT_NAME" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p "127.0.0.1:${STG_MAILPIT_UI_PORT}:8025" \
  ghcr.io/axllent/mailpit:v1.20 >/dev/null

JWT_SECRET_STG="stg_jwt_$(openssl rand -hex 16)"
ADMIN_JWT_SECRET_STG="stg_admin_$(openssl rand -hex 16)"
CRON_SECRET_STG="stg_cron_$(openssl rand -hex 16)"

echo "[staging] (re)launching $STG_API_NAME on :$STG_API_PORT ..."
docker rm -f "$STG_API_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$STG_API_NAME" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p "127.0.0.1:${STG_API_PORT}:4000" \
  -e APP_ENV=production \
  -e PORT=4000 \
  -e CLIENT_ORIGIN="http://127.0.0.1:${STG_API_PORT}" \
  -e DATABASE_URL="postgresql://lilink:${DB_PASSWORD}@lilink-postgres:5432/${STG_DB}?schema=public" \
  -e JWT_SECRET="$JWT_SECRET_STG" \
  -e ADMIN_JWT_SECRET="$ADMIN_JWT_SECRET_STG" \
  -e COOKIE_NAME=lilink_token_stg \
  -e ADMIN_COOKIE_NAME=lilink_admin_token_stg \
  -e SMTP_HOST="$STG_MAILPIT_NAME" \
  -e SMTP_PORT=1025 \
  -e SMTP_SECURE=false \
  -e SMTP_USER=stg \
  -e SMTP_PASS=stg \
  -e SMTP_FROM='stg@lilink.local' \
  -e SMTP_SEND_CONCURRENCY=20 \
  -e SMTP_MAX_CONNECTIONS=20 \
  -e ADMIN_BOOTSTRAP_EMAIL='admin@lilink.local' \
  -e ADMIN_BOOTSTRAP_PASSWORD='StgAdmin_LiLink_42!' \
  -e ADMIN_BOOTSTRAP_NAME='Staging Admin' \
  -e CRON_SECRET="$CRON_SECRET_STG" \
  lilink-api:latest >/dev/null

echo "[staging] Waiting for $STG_API_NAME to become healthy ..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${STG_API_PORT}/v1/health" >/dev/null; then
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    echo "[staging] API failed to start within 60s. Recent logs:" >&2
    docker logs --tail 80 "$STG_API_NAME" >&2 || true
    exit 1
  fi
done

echo "[staging] Seeding default schools + questionnaire + open cycle ..."
docker exec "$STG_API_NAME" node scripts/seed-defaults.mjs

echo "[staging] Ready."
echo "  API:     http://127.0.0.1:${STG_API_PORT}/v1/health"
echo "  Mailpit: http://127.0.0.1:${STG_MAILPIT_UI_PORT}"
echo "  Run:     k6 run -e BASE_URL=http://127.0.0.1:${STG_API_PORT}/v1 loadtest/stage3-request-code.js"
