# Codex bridge на VPS

Спека: `docs/superpowers/specs/2026-09-05-codex-bridge-design.md`.

## Установка / обновление

```bash
scp -i ~/.ssh/fightbase_deploy -r ops/codex-bridge root@31.59.185.86:/root/codex-bridge-src
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'bash /root/codex-bridge-src/install-vps.sh'
```

## Логин (один раз и при протухании)

В ChatGPT: Settings → Security → Device code authorization → включить. Затем:

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'sudo -H -u codexbridge codex login --device-auth'
```

Код из вывода подтвердить на своём устройстве. Проверка: `curl -s 127.0.0.1:8787/healthz` → `"loggedIn": true`.

## Смена модели

`/etc/codex-bridge/env`: `CODEX_BRIDGE_ALLOWED_MODELS` (список через запятую) и
`CODEX_BRIDGE_DEFAULT_MODEL`, затем `systemctl restart codex-bridge`. На проде
`CODEX_BRIDGE_MODEL` в `/opt/fightbase/.env` и `systemctl restart fightbase`.

## Откат

```bash
systemctl disable --now codex-bridge
rm -rf /opt/codex-bridge /etc/codex-bridge /etc/systemd/system/codex-bridge.service
systemctl daemon-reload
userdel -r codexbridge
rm -f /usr/local/bin/codex
```

Amnezia, Docker, iptables, sshd этим не затрагиваются.

## Туннель на проде

Юнит `codex-bridge-tunnel.service`, ключ `/root/.ssh/codex_bridge_tunnel`.
`systemctl status codex-bridge-tunnel`, проверка `curl -s 127.0.0.1:8787/healthz` с прода.
