#!/usr/bin/env bash
# Remove all isTest=true users from the production DB.
# Run after stage-2 to leave the DB in its original state.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
readonly ENV_FILE="${REPO_ROOT}/apps/api/.env"
readonly COOKIE_JAR="$(mktemp -t lilink-loadtest-cookie.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

readonly API_BASE="${API_BASE:-https://api.lilink.top/v1}"
readonly ACCOUNTS_FILE="${REPO_ROOT}/loadtest/.accounts.txt"

if [[ -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  ADMIN_EMAIL="${ADMIN_EMAIL:-$(grep -E '^ADMIN_BOOTSTRAP_EMAIL=' "$ENV_FILE" | sed 's/^[^=]*=//')}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(grep -E '^ADMIN_BOOTSTRAP_PASSWORD=' "$ENV_FILE" | sed 's/^[^=]*=//')}"
fi

echo "[cleanup] Logging in as $ADMIN_EMAIL ..."
curl -sS -X POST "$API_BASE/admin-session/login" \
  -H 'Content-Type: application/json' \
  -c "$COOKIE_JAR" \
  --data "$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")" \
  >/dev/null

echo "[cleanup] DELETE /admin/users/test-users ..."
DELETE_RES="$(curl -sS -X DELETE "$API_BASE/admin/users/test-users" -b "$COOKIE_JAR")"
echo "[cleanup] $DELETE_RES"

if [[ -f "$ACCOUNTS_FILE" ]]; then
  rm -f "$ACCOUNTS_FILE"
  echo "[cleanup] Removed $ACCOUNTS_FILE"
fi
