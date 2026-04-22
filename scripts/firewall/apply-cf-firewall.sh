#!/usr/bin/env bash
# Apply iptables rules so 80/443 traffic is only accepted from the
# Cloudflare ipsets prepared by sync-cloudflare-ips.sh.
#
# Rules are inserted at the *top* of the INPUT chain so they run first.
# Loopback and SSH (22) stay open so we can never lock ourselves out.
# Existing rules with the same comment are removed first to keep this
# script idempotent.
#
# Persistence: rules are saved via netfilter-persistent so they survive
# reboots. Run scripts/firewall/disable-cf-firewall.sh to revert.
set -euo pipefail

readonly RULE_COMMENT='cf-firewall'
readonly CF_V4_SET='cloudflare-v4'
readonly CF_V6_SET='cloudflare-v6'

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root." >&2
  exit 1
fi

if ! ipset list -name "$CF_V4_SET" >/dev/null 2>&1; then
  echo "ipset $CF_V4_SET missing. Run sync-cloudflare-ips.sh first." >&2
  exit 1
fi

remove_existing_rules() {
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

apply_v4() {
  remove_existing_rules iptables
  # Order matters: each rule is inserted at position 1, so the LAST
  # insert ends up first. Plan the chain top-down:
  #   1. lo accept       (added 5th, ends at 1st)
  #   2. ssh accept      (added 4th)
  #   3. CF v4 accept    (added 3rd)
  #   4. CF v6 accept    (handled by ip6tables, not here)
  #   5. drop other 80/443 (added 1st, ends at last drop)
  iptables -I INPUT 1 -p tcp -m multiport --dports 80,443 -j DROP -m comment --comment "$RULE_COMMENT drop-fallback"
  iptables -I INPUT 1 -p tcp -m multiport --dports 80,443 -m set --match-set "$CF_V4_SET" src -j ACCEPT -m comment --comment "$RULE_COMMENT accept-cloudflare-v4"
  iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT -m comment --comment "$RULE_COMMENT accept-ssh"
  iptables -I INPUT 1 -i lo -j ACCEPT -m comment --comment "$RULE_COMMENT accept-loopback"
}

apply_v6() {
  if ! ipset list -name "$CF_V6_SET" >/dev/null 2>&1; then
    return
  fi
  remove_existing_rules ip6tables
  ip6tables -I INPUT 1 -p tcp -m multiport --dports 80,443 -j DROP -m comment --comment "$RULE_COMMENT drop-fallback"
  ip6tables -I INPUT 1 -p tcp -m multiport --dports 80,443 -m set --match-set "$CF_V6_SET" src -j ACCEPT -m comment --comment "$RULE_COMMENT accept-cloudflare-v6"
  ip6tables -I INPUT 1 -p tcp --dport 22 -j ACCEPT -m comment --comment "$RULE_COMMENT accept-ssh"
  ip6tables -I INPUT 1 -i lo -j ACCEPT -m comment --comment "$RULE_COMMENT accept-loopback"
}

apply_v4
apply_v6

if command -v netfilter-persistent >/dev/null 2>&1 && [[ "${SKIP_PERSIST:-0}" != "1" ]]; then
  netfilter-persistent save >/dev/null
  echo "[apply] Rules saved via netfilter-persistent."
else
  echo "[apply] Rules applied (not persisted; reboot will clear them)."
fi

echo "[apply] iptables INPUT (head):"
iptables -L INPUT --line-numbers -n | head -10
