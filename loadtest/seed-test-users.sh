#!/usr/bin/env bash
# Seed ~37 test users in the production DB and emit a flat email list
# (loadtest/.accounts.txt) for the stage-2 k6 script.
#
# Requires:
#   ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD in apps/api/.env
#   (or pass ADMIN_EMAIL / ADMIN_PASSWORD env vars).
#
# Cleanup once done:
#   loadtest/cleanup-test-users.sh
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
readonly ENV_FILE="${REPO_ROOT}/apps/api/.env"
readonly ACCOUNTS_FILE="${REPO_ROOT}/loadtest/.accounts.txt"
readonly COOKIE_JAR="$(mktemp -t lilink-loadtest-cookie.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

readonly API_BASE="${API_BASE:-https://api.lilink.top/v1}"

if [[ -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ENV file not found: $ENV_FILE" >&2
    exit 1
  fi
  ADMIN_EMAIL="${ADMIN_EMAIL:-$(grep -E '^ADMIN_BOOTSTRAP_EMAIL=' "$ENV_FILE" | sed 's/^[^=]*=//')}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(grep -E '^ADMIN_BOOTSTRAP_PASSWORD=' "$ENV_FILE" | sed 's/^[^=]*=//')}"
fi

if [[ -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "Missing admin credentials. Set ADMIN_EMAIL and ADMIN_PASSWORD or populate apps/api/.env." >&2
  exit 1
fi

echo "[seed] Logging in as $ADMIN_EMAIL ..."
LOGIN_RES="$(
  curl -sS -X POST "$API_BASE/admin-session/login" \
    -H 'Content-Type: application/json' \
    -c "$COOKIE_JAR" \
    --data "$(printf '{"email":"%s","password":"%s"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
)"
if ! echo "$LOGIN_RES" | grep -q '"ok":true'; then
  echo "[seed] Admin login failed: $LOGIN_RES" >&2
  exit 1
fi

echo "[seed] Calling POST /admin/seed-test-users ..."
SEED_RES="$(curl -sS -X POST "$API_BASE/admin/seed-test-users" -b "$COOKIE_JAR")"
if ! echo "$SEED_RES" | grep -q '"ok":true'; then
  echo "[seed] seed-test-users failed: $SEED_RES" >&2
  exit 1
fi
echo "[seed] $SEED_RES"

echo "[seed] Listing isTest=true accounts ..."
curl -sS "$API_BASE/admin/users?userType=test&pageSize=50" -b "$COOKIE_JAR" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items') or data.get('users') or []
emails = sorted({u['email'] for u in items if isinstance(u, dict) and u.get('email')})
with open(sys.argv[1], 'w') as fh:
    for email in emails:
        fh.write(email + '\n')
print(f'[seed] Wrote {len(emails)} accounts to {sys.argv[1]}', file=sys.stderr)
" "$ACCOUNTS_FILE"

echo "[seed] Done. Run:"
echo "  k6 run -e ACCOUNTS_FILE=$ACCOUNTS_FILE loadtest/stage2-login.js"
