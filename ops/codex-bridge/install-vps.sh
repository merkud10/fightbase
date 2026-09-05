#!/bin/bash
# Установка/обновление моста на VPS. Не трогает Docker, iptables, sshd, сеть.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE=/etc/codex-bridge/env
BRIDGE_DIR=/opt/codex-bridge
BRIDGE_USER=codexbridge
BRIDGE_HOME=/home/$BRIDGE_USER

if ! id "$BRIDGE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$BRIDGE_HOME" --shell /usr/sbin/nologin "$BRIDGE_USER"
  echo "created user $BRIDGE_USER"
fi
install -d -o "$BRIDGE_USER" -g "$BRIDGE_USER" -m 0750 "$BRIDGE_HOME" "$BRIDGE_HOME/work" "$BRIDGE_HOME/.ssh"

install -d -m 0755 /etc/codex-bridge
if [ ! -f "$ENV_FILE" ]; then
  sed "s/replace-with-openssl-rand-hex-32/$(openssl rand -hex 32)/" "$SRC_DIR/env.example" > "$ENV_FILE"
  echo "created $ENV_FILE with a fresh token"
fi
chown root:"$BRIDGE_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

CODEX_VERSION="$(grep -E '^CODEX_VERSION=' "$ENV_FILE" | cut -d= -f2)"
if ! command -v codex >/dev/null 2>&1 || ! codex --version | grep -q "$CODEX_VERSION"; then
  TMP="$(mktemp -d)"
  URL="https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-x86_64-unknown-linux-musl.tar.gz"
  echo "downloading $URL"
  curl -fsSL --retry 3 -o "$TMP/codex.tar.gz" "$URL"
  tar -xzf "$TMP/codex.tar.gz" -C "$TMP"
  BIN="$(find "$TMP" -maxdepth 2 -type f -name 'codex*' ! -name '*.tar.gz' | head -n 1)"
  install -m 0755 "$BIN" /usr/local/bin/codex
  rm -rf "$TMP"
fi
codex --version

install -d -m 0755 "$BRIDGE_DIR"
install -m 0644 "$SRC_DIR/bridge.py" "$BRIDGE_DIR/bridge.py"
install -m 0644 "$SRC_DIR/codex-bridge.service" /etc/systemd/system/codex-bridge.service
systemctl daemon-reload
systemctl enable --now codex-bridge
systemctl restart codex-bridge
sleep 1
systemctl --no-pager --lines=5 status codex-bridge
curl -fsS http://127.0.0.1:8787/healthz
echo
