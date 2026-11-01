# Codex bridge на VPS

## Telegram-прокси (31.10.2026)

На том же VPS работает отдельный `telegram-proxy.service`: Python relay на
`127.0.0.1:8788`, единственный upstream — HTTPS `api.telegram.org`.
Принимает Bot API GET/POST, включая multipart для фотографий. Пути и токены
не журналируются; повторных отправок после сетевых ошибок нет.

На проде `telegram-proxy-tunnel.service` использует существующий SSH-ключ,
но отдельное соединение. В `authorized_keys` VPS для ключа разрешены только
`127.0.0.1:8787` и `127.0.0.1:8788`. Сервисы Codex не меняются.

В `/opt/fightbase/.env`: `TELEGRAM_API_BASE_URL=http://127.0.0.1:8788`.
Настройку используют социальные публикации, пики, operational alerts и local scheduler.
После изменения адреса нужен `systemctl restart fightbase`; cron читает `.env`
при следующем запуске. Изменения скриптов также должны сохраняться при следующих деплоях.

Проверка: `getMe` через этот адрес с токеном из окружения (не выводить токен
или полный URL). `systemctl is-active telegram-proxy` на VPS и
`systemctl is-active telegram-proxy-tunnel` на проде.

Откат: вернуть предыдущий `TELEGRAM_API_BASE_URL` (обычно удалить строку),
перезапустить `fightbase`, отключить `telegram-proxy-tunnel` на проде и
`telegram-proxy` на VPS. Удалить только дополнительный `permitopen` для 8788.
Резервные копии файлов продакшена: `/opt/fightbase/backups/telegram-proxy-20261031/`.
Не восстанавливать старый `.env` целиком, если после этого менялись другие настройки.

Спека: `docs/superpowers/specs/2026-09-05-codex-bridge-design.md`.

## Установка / обновление

```bash
scp -i ~/.ssh/fightbase_deploy -r ops/codex-bridge root@179.254.164.181:/root/codex-bridge-src
ssh -i ~/.ssh/fightbase_deploy root@179.254.164.181 'bash /root/codex-bridge-src/install-vps.sh'
```

## Логин (один раз и при протухании)

В ChatGPT: Settings → Security → Device code authorization → включить. Затем:

```bash
ssh -i ~/.ssh/fightbase_deploy root@179.254.164.181 'sudo -H -u codexbridge codex login --device-auth'
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

С 01.11.2026 мост живёт на `179.254.164.181` (Hostinux, Франкфурт, услуга
DE-Promo #40767 `vm40767.hostinux.network`, 1 vCPU, 1 ГБ RAM, 8 ГБ диск,
Ubuntu 22.04; рядом Amnezia в Docker, UDP 32591 — не трогать). Прежние
`31.56.48.34` (HostVDS, Франция, 31.10–01.11), `201.51.10.131` (Timeweb,
Амстердам) и `31.59.185.86` (HostVDS) недоступны.

Доступ: панель `my.hostinux.com` (BILLmanager), консоль — «Виртуальные
выделенные серверы» → VNC (noVNC). При автоматизированном вводе консоль теряет
Shift и Ctrl и игнорирует буфер обмена: доступны только строчные буквы, цифры,
пробел и `- / . ; \ ' [ ] = ,` (обратная кавычка набирается как `~`). Ключ
`fightbase_deploy` поэтому записан так: `cp /etc/hostname k`, затем
`sed -i 's/<hostname>/<ключ с \xHH вместо заглавных и +>/' k`, затем
``mv k `printf 'authorized\137keys'` ``. После этого всё делается по SSH.

1. Положить на VPS `/etc/codex-bridge/env` с тем же `CODEX_BRIDGE_TOKEN`, что в
   `/opt/fightbase/.env` прода, — тогда `.env` прода не меняется. Затем установка
   и логин, как выше. Файлы из Windows-чекаута приходят с CRLF — перед
   `install-vps.sh` снять `\r` (`sed -i 's/\r$//'`).
2. На VPS в `/home/codexbridge/.ssh/authorized_keys` — публичный ключ туннеля
   с прода (`/root/.ssh/codex_bridge_tunnel.pub`) с ограничением
   `restrict,port-forwarding,permitopen="127.0.0.1:8787",permitopen="127.0.0.1:8788"`.
3. Поставить Telegram-прокси: `telegram-proxy.py` в `/opt/codex-bridge/`,
   `telegram-proxy.service` в `/etc/systemd/system/`, `systemctl enable --now telegram-proxy`.
4. На проде: host key VPS в `/root/.ssh/known_hosts` (туннель идёт со
   `StrictHostKeyChecking=yes`), новый IP в `codex-bridge-tunnel.service` и
   `telegram-proxy-tunnel.service`,
   `systemctl daemon-reload && systemctl restart codex-bridge-tunnel telegram-proxy-tunnel`.
5. Слепок `snapshot.sh` до и после: должны добавиться только `127.0.0.1:8787`,
   `127.0.0.1:8788`, пользователь `codexbridge`, `codex-bridge.service` и
   `telegram-proxy.service`.
