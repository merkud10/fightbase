# Codex bridge на VPS

Спека: `docs/superpowers/specs/2026-09-05-codex-bridge-design.md`.

## Установка / обновление

```bash
scp -i ~/.ssh/fightbase_deploy -r ops/codex-bridge root@31.56.48.34:/root/codex-bridge-src
ssh -i ~/.ssh/fightbase_deploy root@31.56.48.34 'bash /root/codex-bridge-src/install-vps.sh'
```

## Логин (один раз и при протухании)

В ChatGPT: Settings → Security → Device code authorization → включить. Затем:

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.56.48.34 'sudo -H -u codexbridge codex login --device-auth'
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

## Мониторинг

На проде крон `cron-tasks.sh bridge-check` (05:45, 11:45, 17:45 UTC) дёргает
`/healthz` через туннель и шлёт алерт в Telegram, если мост недоступен или
Codex разлогинился. Ручной запуск: `sudo -u fightbase bash /opt/fightbase/scripts/cron-tasks.sh bridge-check`.

## Туннель на проде

Юнит `codex-bridge-tunnel.service`, ключ `/root/.ssh/codex_bridge_tunnel`.
`systemctl status codex-bridge-tunnel`, проверка `curl -s 127.0.0.1:8787/healthz` с прода.

## Переезд на новый VPS

С 31.10.2026 мост живёт на `31.56.48.34` (HostVDS, Франция, рядом Amnezia
в Docker, UDP 35176); прежние `201.51.10.131` (Timeweb, Амстердам) и
`31.59.185.86` (HostVDS) недоступны.

1. Положить на VPS `/etc/codex-bridge/env` с тем же `CODEX_BRIDGE_TOKEN`, что в
   `/opt/fightbase/.env` прода, — тогда `.env` прода не меняется. Затем установка
   и логин, как выше.
2. На VPS в `/home/codexbridge/.ssh/authorized_keys` — публичный ключ туннеля
   с прода (`/root/.ssh/codex_bridge_tunnel.pub`) с ограничением
   `restrict,port-forwarding,permitopen="127.0.0.1:8787"`.
3. На проде: host key VPS в `/root/.ssh/known_hosts` (туннель идёт со
   `StrictHostKeyChecking=yes`), новый IP в `codex-bridge-tunnel.service`,
   `systemctl daemon-reload && systemctl restart codex-bridge-tunnel`.
4. Слепок `snapshot.sh` до и после: должны добавиться только `127.0.0.1:8787`,
   пользователь `codexbridge` и `codex-bridge.service`.
