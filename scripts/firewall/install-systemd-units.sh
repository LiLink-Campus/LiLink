#!/usr/bin/env bash
# Install (or refresh) the systemd unit + timer that keep the Cloudflare
# IP allow-list and the cf-firewall iptables rules up to date.
#
# Idempotent: copies the units into /etc/systemd/system, reloads systemd,
# enables the timer, and starts a one-shot sync immediately so the rules
# are in place without waiting for the OnBoot delay.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
readonly UNIT_SRC_DIR="$REPO_ROOT/scripts/firewall"
readonly UNIT_DEST_DIR="/etc/systemd/system"
readonly UNITS=(cf-firewall-sync.service cf-firewall-sync.timer)

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root." >&2
  exit 1
fi

for unit in "${UNITS[@]}"; do
  install -m 644 "$UNIT_SRC_DIR/$unit" "$UNIT_DEST_DIR/$unit"
  echo "[install] $UNIT_DEST_DIR/$unit"
done

systemctl daemon-reload
systemctl enable cf-firewall-sync.timer
systemctl restart cf-firewall-sync.timer
systemctl start cf-firewall-sync.service

echo "[install] Timer schedule:"
systemctl list-timers cf-firewall-sync.timer --no-pager
