#!/usr/bin/env bash
# Refresh ipset entries for the public Cloudflare IP ranges.
#
# Creates/updates two ipsets used by apply-cf-firewall.sh:
#   - cloudflare-v4 (hash:net family inet)
#   - cloudflare-v6 (hash:net family inet6)
#
# Atomic swap: rebuild a temporary set, then `ipset swap` so live traffic
# never sees an empty allow-list. Idempotent — safe to run from cron/timer.
#
# Source of truth:
#   https://www.cloudflare.com/ips-v4
#   https://www.cloudflare.com/ips-v6
set -euo pipefail

readonly CF_V4_URL='https://www.cloudflare.com/ips-v4'
readonly CF_V6_URL='https://www.cloudflare.com/ips-v6'
readonly CF_V4_SET='cloudflare-v4'
readonly CF_V6_SET='cloudflare-v6'

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root (need ipset)." >&2
  exit 1
fi

fetch() {
  local url="$1"
  curl -sf --max-time 15 "$url"
}

ensure_set() {
  local name="$1"
  local family="$2"
  if ! ipset list -name "$name" >/dev/null 2>&1; then
    ipset create "$name" hash:net family "$family"
  fi
}

rebuild_set() {
  local name="$1"
  local family="$2"
  local source_url="$3"

  local cidrs
  if ! cidrs="$(fetch "$source_url")" || [[ -z "$cidrs" ]]; then
    echo "Failed to fetch $source_url; leaving $name unchanged." >&2
    return 1
  fi

  local tmp_set="${name}-tmp"
  ipset destroy "$tmp_set" 2>/dev/null || true
  ipset create "$tmp_set" hash:net family "$family"

  local count=0
  while IFS= read -r cidr; do
    [[ -z "$cidr" ]] && continue
    ipset add "$tmp_set" "$cidr"
    count=$((count + 1))
  done <<<"$cidrs"

  ensure_set "$name" "$family"
  ipset swap "$tmp_set" "$name"
  ipset destroy "$tmp_set"

  echo "[sync] $name updated: $count entries"
}

rebuild_set "$CF_V4_SET" inet "$CF_V4_URL"
rebuild_set "$CF_V6_SET" inet6 "$CF_V6_URL" || true
