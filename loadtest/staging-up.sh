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
# Secret-bearing values are written to ignored local files and bind-mounted
# read-only so `docker inspect` does not expose them as container env values.
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
readonly STG_SECRET_ROOT="${REPO_ROOT}/loadtest/.staging-secrets"
readonly STG_SECRET_DIR="${STG_SECRET_DIR:-$STG_SECRET_ROOT}"

resolve_secret_dir() {
  local target_dir="$1"
  local absolute_target
  local existing_ancestor
  local resolved_existing_ancestor
  local resolved_secret_root_parent
  local resolved_target
  local resolved_secret_root

  if [[ -z "$target_dir" ]]; then
    echo "[staging] STG_SECRET_DIR must not be empty." >&2
    exit 1
  fi

  resolved_secret_root_parent="$(cd "$(dirname "$STG_SECRET_ROOT")" && pwd -P)"
  resolved_secret_root="${resolved_secret_root_parent}/$(basename "$STG_SECRET_ROOT")"

  if [[ "$target_dir" == /* ]]; then
    absolute_target="$target_dir"
  else
    absolute_target="$(pwd -P)/$target_dir"
  fi

  resolved_target="$(normalize_absolute_path "$absolute_target")"

  if [[ "$resolved_target" != "$resolved_secret_root" && "$resolved_target" != "$resolved_secret_root"/* ]]; then
    echo "[staging] STG_SECRET_DIR must be $STG_SECRET_ROOT or a child path." >&2
    exit 1
  fi

  existing_ancestor="$resolved_target"
  while [[ ! -d "$existing_ancestor" ]]; do
    existing_ancestor="$(dirname "$existing_ancestor")"
  done

  resolved_existing_ancestor="$(cd "$existing_ancestor" && pwd -P)"
  if [[ "$existing_ancestor" != "$resolved_secret_root_parent" && "$resolved_existing_ancestor" != "$resolved_secret_root" && "$resolved_existing_ancestor" != "$resolved_secret_root"/* ]]; then
    echo "[staging] STG_SECRET_DIR existing parent must stay inside $STG_SECRET_ROOT." >&2
    exit 1
  fi

  if [[ "$resolved_target" == "/" || "$resolved_target" == "$REPO_ROOT" || "$resolved_target" == "${REPO_ROOT}/loadtest" ]]; then
    echo "[staging] Refusing to remove unsafe STG_SECRET_DIR: $resolved_target" >&2
    exit 1
  fi

  printf '%s' "$resolved_target"
}

normalize_absolute_path() {
  local path="$1"
  local part
  local normalized="/"
  local -a parts=()
  local -a stack=()

  if [[ "$path" != /* ]]; then
    echo "[staging] Internal error: expected absolute path for normalization." >&2
    exit 1
  fi

  IFS='/' read -r -a parts <<<"$path"
  for part in "${parts[@]}"; do
    case "$part" in
      "" | ".")
        ;;
      "..")
        if (( ${#stack[@]} > 0 )); then
          unset 'stack[${#stack[@]}-1]'
        fi
        ;;
      *)
        stack+=("$part")
        ;;
    esac
  done

  if (( ${#stack[@]} > 0 )); then
    printf -v normalized '/%s' "${stack[0]}"
    for part in "${stack[@]:1}"; do
      normalized="${normalized}/${part}"
    done
  fi

  printf '%s' "$normalized"
}

readonly RESOLVED_STG_SECRET_DIR="$(resolve_secret_dir "$STG_SECRET_DIR")"

prepare_secret_dir() {
  rm -rf -- "$RESOLVED_STG_SECRET_DIR"
  mkdir -p "$RESOLVED_STG_SECRET_DIR"
  chmod 700 "$RESOLVED_STG_SECRET_DIR"
}

read_env_value() {
  local name="$1"
  local value="${!name:-}"

  if [[ -n "$value" ]]; then
    printf '%s' "$value"
    return
  fi

  if [[ -f "$ENV_FILE" ]]; then
    grep -E "^${name}=" "$ENV_FILE" | tail -n 1 | sed 's/^[^=]*=//' || true
  fi
}

DB_PASSWORD="$(read_env_value DB_PASSWORD)"
if [[ -z "${DB_PASSWORD:-}" ]]; then
  echo "[staging] DB_PASSWORD must be set in the environment or $ENV_FILE." >&2
  exit 1
fi

STG_ADMIN_BOOTSTRAP_PASSWORD="$(read_env_value STG_ADMIN_BOOTSTRAP_PASSWORD)"
if [[ -z "${STG_ADMIN_BOOTSTRAP_PASSWORD:-}" ]]; then
  echo "[staging] STG_ADMIN_BOOTSTRAP_PASSWORD must be set in the environment or $ENV_FILE." >&2
  exit 1
fi

write_secret_file() {
  local name="$1"
  local value="$2"
  local path="${RESOLVED_STG_SECRET_DIR}/${name}"

  (umask 033 && printf '%s' "$value" >"$path")
  chmod 0444 "$path"
}

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
prepare_secret_dir
write_secret_file db_password "$DB_PASSWORD"
write_secret_file admin_bootstrap_password "$STG_ADMIN_BOOTSTRAP_PASSWORD"
write_secret_file jwt_secret "$JWT_SECRET_STG"
write_secret_file admin_jwt_secret "$ADMIN_JWT_SECRET_STG"
write_secret_file cron_secret "$CRON_SECRET_STG"

echo "[staging] (re)launching $STG_API_NAME on :$STG_API_PORT ..."
docker rm -f "$STG_API_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$STG_API_NAME" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -p "127.0.0.1:${STG_API_PORT}:4000" \
  --mount "type=bind,src=${RESOLVED_STG_SECRET_DIR}/db_password,dst=/run/secrets/lilink_stg_db_password,readonly" \
  --mount "type=bind,src=${RESOLVED_STG_SECRET_DIR}/admin_bootstrap_password,dst=/run/secrets/lilink_stg_admin_bootstrap_password,readonly" \
  --mount "type=bind,src=${RESOLVED_STG_SECRET_DIR}/jwt_secret,dst=/run/secrets/lilink_stg_jwt_secret,readonly" \
  --mount "type=bind,src=${RESOLVED_STG_SECRET_DIR}/admin_jwt_secret,dst=/run/secrets/lilink_stg_admin_jwt_secret,readonly" \
  --mount "type=bind,src=${RESOLVED_STG_SECRET_DIR}/cron_secret,dst=/run/secrets/lilink_stg_cron_secret,readonly" \
  -e APP_ENV=production \
  -e PORT=4000 \
  -e CLIENT_ORIGIN="http://127.0.0.1:${STG_API_PORT}" \
  -e STG_DB="$STG_DB" \
  -e DB_PASSWORD_FILE=/run/secrets/lilink_stg_db_password \
  -e ADMIN_BOOTSTRAP_PASSWORD_FILE=/run/secrets/lilink_stg_admin_bootstrap_password \
  -e JWT_SECRET_FILE=/run/secrets/lilink_stg_jwt_secret \
  -e ADMIN_JWT_SECRET_FILE=/run/secrets/lilink_stg_admin_jwt_secret \
  -e CRON_SECRET_FILE=/run/secrets/lilink_stg_cron_secret \
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
  -e ADMIN_BOOTSTRAP_NAME='Staging Admin' \
  lilink-api:latest \
  sh -c '
    set -eu

    read_secret() {
      secret_path="$1"
      secret_name="$2"
      if [ ! -s "$secret_path" ]; then
        echo "[staging] $secret_name secret file is missing or empty." >&2
        exit 1
      fi
      cat "$secret_path"
    }

    encode_uri_component() {
      node -e '\''process.stdout.write(encodeURIComponent(process.argv[1] ?? ""))'\'' "$1"
    }

    db_password="$(read_secret "$DB_PASSWORD_FILE" DB_PASSWORD)"
    db_password_encoded="$(encode_uri_component "$db_password")"

    export DATABASE_URL="postgresql://lilink:${db_password_encoded}@lilink-postgres:5432/${STG_DB}?schema=public"
    export JWT_SECRET="$(read_secret "$JWT_SECRET_FILE" JWT_SECRET)"
    export ADMIN_JWT_SECRET="$(read_secret "$ADMIN_JWT_SECRET_FILE" ADMIN_JWT_SECRET)"
    export ADMIN_BOOTSTRAP_PASSWORD="$(read_secret "$ADMIN_BOOTSTRAP_PASSWORD_FILE" ADMIN_BOOTSTRAP_PASSWORD)"
    export CRON_SECRET="$(read_secret "$CRON_SECRET_FILE" CRON_SECRET)"

    npx prisma migrate deploy && node scripts/bootstrap-admin.mjs && node scripts/seed-defaults.mjs && node dist/src/main.js
  ' >/dev/null

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

echo "[staging] Ready."
echo "  API:     http://127.0.0.1:${STG_API_PORT}/v1/health"
echo "  Mailpit: http://127.0.0.1:${STG_MAILPIT_UI_PORT}"
echo "  Run:     k6 run -e BASE_URL=http://127.0.0.1:${STG_API_PORT}/v1 loadtest/stage3-request-code.js"
