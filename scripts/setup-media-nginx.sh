#!/bin/bash
# =============================================================
# Ensures nginx serves /media/ directly from standalone/public
# Idempotent: safe to re-run. Run with sudo on the server.
# =============================================================
set -euo pipefail

CONF="/etc/nginx/sites-available/fightbase"
MEDIA_ROOT="/opt/fightbase/.next/standalone/public/media/"
MARKER="# fightbase-media-location"

if [ ! -f "$CONF" ]; then
  echo "nginx site config not found at $CONF"
  exit 1
fi

if grep -q "$MARKER" "$CONF"; then
  echo "/media/ location already present — nothing to do"
else
  echo "Injecting /media/ location block into $CONF"
  BLOCK="    ${MARKER}\n    location /media/ {\n        alias ${MEDIA_ROOT};\n        access_log off;\n        expires 30d;\n        add_header Cache-Control \"public, immutable\";\n        try_files \$uri =404;\n    }\n"
  awk -v block="$BLOCK" '
    /location \/ {/ && !done {
      printf "%s", block
      done = 1
    }
    { print }
  ' "$CONF" > "${CONF}.new"
  mv "${CONF}.new" "$CONF"
fi

echo "Testing nginx config"
nginx -t

echo "Reloading nginx"
systemctl reload nginx

echo "Done"
