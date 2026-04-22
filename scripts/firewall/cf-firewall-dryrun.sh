#!/usr/bin/env bash
# Apply the cf-firewall rules with an automatic rollback after N seconds
# (default 300 = 5 minutes). Used the first time the rules go live so a
# misconfiguration cannot lock anyone out for more than the safety window.
#
# Usage:
#   sudo scripts/firewall/cf-firewall-dryrun.sh           # 5 minute window
#   sudo SAFETY_SECONDS=600 scripts/firewall/cf-firewall-dryrun.sh
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
readonly APPLY="$REPO_ROOT/scripts/firewall/apply-cf-firewall.sh"
readonly DISABLE="$REPO_ROOT/scripts/firewall/disable-cf-firewall.sh"
readonly SAFETY_SECONDS="${SAFETY_SECONDS:-300}"
readonly LOG_FILE="/tmp/cf-firewall-dryrun.log"

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root." >&2
  exit 1
fi

echo "[dryrun] Applying cf-firewall, will auto-disable after ${SAFETY_SECONDS}s."
echo "[dryrun] Cancel with: sudo pkill -f cf-firewall-dryrun-watchdog"

SKIP_PERSIST=1 bash "$APPLY"

# Spawn watchdog detached from this shell so the user's terminal can exit
# without killing it. systemd-run gives us a clean cgroup that survives.
if command -v systemd-run >/dev/null 2>&1; then
  systemd-run --quiet --unit=cf-firewall-dryrun-watchdog --description='cf-firewall auto-rollback' \
    /bin/bash -c "sleep $SAFETY_SECONDS && SKIP_PERSIST=1 bash '$DISABLE' >>'$LOG_FILE' 2>&1"
else
  setsid bash -c "sleep $SAFETY_SECONDS && SKIP_PERSIST=1 bash '$DISABLE' >>'$LOG_FILE' 2>&1" \
    </dev/null >/dev/null 2>&1 &
  disown || true
fi

echo "[dryrun] Watchdog armed. To commit (skip auto-rollback) before the window expires:"
echo "  sudo systemctl stop cf-firewall-dryrun-watchdog 2>/dev/null || sudo pkill -f cf-firewall-dryrun-watchdog"
echo "  sudo bash $APPLY    # this re-applies AND persists"
