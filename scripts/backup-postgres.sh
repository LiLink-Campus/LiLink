#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly DEFAULT_ENV_FILE="${PROJECT_ROOT}/.env"
readonly DEFAULT_BACKUP_DIRECTORY="/home/admin/backups/lilink"
readonly DEFAULT_CONTAINER_NAME="lilink-postgres"
readonly DEFAULT_DATABASE_NAME="lilink"
readonly DEFAULT_DATABASE_USER="lilink"
readonly DEFAULT_RETENTION_DAYS="7"

ENV_FILE="${ENV_FILE:-${DEFAULT_ENV_FILE}}"
BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-${DEFAULT_BACKUP_DIRECTORY}}"
POSTGRES_CONTAINER_NAME="${POSTGRES_CONTAINER_NAME:-${DEFAULT_CONTAINER_NAME}}"
POSTGRES_DATABASE_NAME="${POSTGRES_DATABASE_NAME:-${DEFAULT_DATABASE_NAME}}"
POSTGRES_DATABASE_USER="${POSTGRES_DATABASE_USER:-${DEFAULT_DATABASE_USER}}"
RETENTION_DAYS="${RETENTION_DAYS:-${DEFAULT_RETENTION_DAYS}}"

readonly TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly BACKUP_FILENAME="postgres-${POSTGRES_DATABASE_NAME}-${TIMESTAMP}.sql.gz"
TEMP_BACKUP_PATH="${BACKUP_DIRECTORY}/${BACKUP_FILENAME}.tmp"
readonly FINAL_BACKUP_PATH="${BACKUP_DIRECTORY}/${BACKUP_FILENAME}"

cleanup_temporary_file() {
  if [[ -n "${TEMP_BACKUP_PATH:-}" && -f "${TEMP_BACKUP_PATH}" ]]; then
    rm -f "${TEMP_BACKUP_PATH}"
  fi
}

trap cleanup_temporary_file EXIT

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    fail "Required command not found: ${command_name}"
  fi
}

read_env_value() {
  local key="$1"
  local value

  if [[ ! -f "${ENV_FILE}" ]]; then
    fail "Environment file does not exist: ${ENV_FILE}"
  fi

  value="$(sed -n "s/^${key}=//p" "${ENV_FILE}" | sed -n '1p')"

  if [[ -z "${value}" ]]; then
    fail "Missing required key in ${ENV_FILE}: ${key}"
  fi

  printf '%s' "${value}"
}

validate_inputs() {
  if [[ ! "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
    fail "RETENTION_DAYS must be a non-negative integer."
  fi
}

require_command docker
require_command gzip
require_command sed
require_command find
require_command date
validate_inputs

readonly DATABASE_PASSWORD="$(read_env_value "DB_PASSWORD")"

if ! docker container inspect "${POSTGRES_CONTAINER_NAME}" >/dev/null 2>&1; then
  fail "Postgres container not found: ${POSTGRES_CONTAINER_NAME}"
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "${POSTGRES_CONTAINER_NAME}")" != "true" ]]; then
  fail "Postgres container is not running: ${POSTGRES_CONTAINER_NAME}"
fi

mkdir -p "${BACKUP_DIRECTORY}"

docker exec \
  -e "PGPASSWORD=${DATABASE_PASSWORD}" \
  "${POSTGRES_CONTAINER_NAME}" \
  pg_dump \
  --username="${POSTGRES_DATABASE_USER}" \
  --dbname="${POSTGRES_DATABASE_NAME}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | gzip -9 > "${TEMP_BACKUP_PATH}"

gzip -t "${TEMP_BACKUP_PATH}"
mv "${TEMP_BACKUP_PATH}" "${FINAL_BACKUP_PATH}"
TEMP_BACKUP_PATH=""

find "${BACKUP_DIRECTORY}" \
  -type f \
  -name 'postgres-*.sql.gz' \
  -mtime +"${RETENTION_DAYS}" \
  -delete

printf 'Backup created: %s\n' "${FINAL_BACKUP_PATH}"
