#!/bin/bash
# =============================================================
# Verifies that build artifacts are owned by the runtime user.
# Wire this into systemd as ExecStartPre to fail fast when an
# operator runs `npm run build` as root and forgets chown.
#
# Usage (in fightbase.service):
#   ExecStartPre=/opt/fightbase/scripts/verify-ownership.sh fightbase
# =============================================================
set -euo pipefail

EXPECTED_USER="${1:-fightbase}"
APP_DIR="${APP_DIR:-/opt/fightbase}"

check_owner() {
  local target="$1"
  if [ ! -e "$target" ]; then
    return 0
  fi
  local owner
  owner="$(stat -c '%U' "$target")"
  if [ "$owner" != "$EXPECTED_USER" ]; then
    echo "ERROR: $target is owned by '$owner', expected '$EXPECTED_USER'" >&2
    echo "Fix: sudo chown -R ${EXPECTED_USER}:${EXPECTED_USER} ${APP_DIR}/.next" >&2
    return 1
  fi
}

check_owner "${APP_DIR}/.next"
check_owner "${APP_DIR}/.next/standalone"
check_owner "${APP_DIR}/.next/standalone/server.js"

echo "ownership ok (${EXPECTED_USER})"
