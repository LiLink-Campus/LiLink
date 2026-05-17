#!/usr/bin/env bash
# Tear down the staging stack created by staging-up.sh and drop lilink_stg.
set -euo pipefail

readonly STG_API_NAME="lilink-api-stg"
readonly STG_MAILPIT_NAME="lilink-mailpit-stg"
readonly STG_DB="lilink_stg"
readonly REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

echo "[staging] Removing $STG_API_NAME and $STG_MAILPIT_NAME ..."
docker rm -f "$STG_API_NAME" >/dev/null 2>&1 || true
docker rm -f "$STG_MAILPIT_NAME" >/dev/null 2>&1 || true
rm -rf -- "$RESOLVED_STG_SECRET_DIR"

echo "[staging] Dropping database $STG_DB ..."
docker exec lilink-postgres psql -U lilink -c "DROP DATABASE IF EXISTS $STG_DB"

echo "[staging] Done."
