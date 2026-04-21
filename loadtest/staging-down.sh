#!/usr/bin/env bash
# Tear down the staging stack created by staging-up.sh and drop lilink_stg.
set -euo pipefail

readonly STG_API_NAME="lilink-api-stg"
readonly STG_MAILPIT_NAME="lilink-mailpit-stg"
readonly STG_DB="lilink_stg"

echo "[staging] Removing $STG_API_NAME and $STG_MAILPIT_NAME ..."
docker rm -f "$STG_API_NAME" >/dev/null 2>&1 || true
docker rm -f "$STG_MAILPIT_NAME" >/dev/null 2>&1 || true

echo "[staging] Dropping database $STG_DB ..."
docker exec lilink-postgres psql -U lilink -c "DROP DATABASE IF EXISTS $STG_DB"

echo "[staging] Done."
