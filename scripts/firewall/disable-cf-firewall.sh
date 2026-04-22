#!/usr/bin/env bash
# Tear down every iptables rule tagged with the cf-firewall comment.
# Use this if Cloudflare access breaks or for emergency rollback.
set -euo pipefail

readonly RULE_COMMENT='cf-firewall'

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root." >&2
  exit 1
fi

remove_for() {
  local table_cmd="$1"
  local line_nums
  line_nums="$($table_cmd -L INPUT --line-numbers -n 2>/dev/null \
    | awk -v c="$RULE_COMMENT" '$0 ~ c {print $1}' \
    | sort -rn)"
  if [[ -z "$line_nums" ]]; then
    return
  fi
  while IFS= read -r line_num; do
    $table_cmd -D INPUT "$line_num"
  done <<<"$line_nums"
}

remove_for iptables
remove_for ip6tables 2>/dev/null || true

if command -v netfilter-persistent >/dev/null 2>&1 && [[ "${SKIP_PERSIST:-0}" != "1" ]]; then
  netfilter-persistent save >/dev/null
fi

echo "[disable] cf-firewall rules removed."
iptables -L INPUT --line-numbers -n | head -10
