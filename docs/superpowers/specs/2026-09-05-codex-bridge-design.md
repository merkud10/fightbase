# Мост к Codex на VPS: Spark как AI-провайдер сайта

Дата: 2026-09-05

## Проблема

Сайт работает на сервере в России, откуда закрыты `api.openai.com` и
`chatgpt.com` (403 по гео, проверено с прода 05.09.2026). Поэтому все
AI-задачи (перевод и рерайт новостей, дайджест для Telegram, тексты
прогнозов) идут через DeepSeek. Алиас `deepseek-chat` сейчас маршрутизируется
на DeepSeek V4 Flash без рассуждений.

У пользователя есть ChatGPT Pro с отдельным, неиспользуемым лимитом модели
`gpt-5.3-codex-spark`, и VPS в Амстердаме (HostVDS, `31.59.185.86`, Ubuntu
24.04, 1 ядро, 961 МБ памяти, 3.8 ГБ свободного диска), на котором крутится
самохостинговая Amnezia VPN. Цель: подключить Spark к сайту через этот VPS
так, чтобы потом модель можно было заменить на более сильную из той же
подписки (например, для модели прогнозов) одной настройкой.

### Что выяснилось при осмотре

- Spark нет в API OpenAI. Он доступен только в клиентах Codex (CLI,
  приложение, IDE) по логину ChatGPT, только на плане Pro, с отдельным
  лимитом. Официальный `codex-responses-api-proxy` работает по API-ключу и
  подписку не открывает.
- Codex CLI распространяется автономным Linux-бинарником
  (`codex-x86_64-unknown-linux-musl`), Node не нужен. Логин на сервере без
  браузера: `codex login --device-auth`, при включённой в ChatGPT настройке
  Settings → Security → Device code authorization.
- Проблемы с ufc.com к VPS отношения не имеют: страницы и картинки ufc.com
  с прода открываются через `fetch`, 403 даёт только «настоящий» Chrome
  `User-Agent` в `app/api/image-proxy/route.ts`, `lib/local-image-storage.ts`
  и `lib/social-publish.ts`. Это отдельная маленькая правка вне этого
  дизайна.
- Egress-прокси через VPS дал бы проду только платный API OpenAI по ключу.
  Из объёма исключён; при необходимости делается отдельно.

### Оговорки, принятые пользователем

- Spark — research preview, слабее полного GPT-5.3-Codex, 128K контекста,
  только текст, заточен под код. Качество русского текста не гарантировано,
  поэтому переключение прода делается только по итогам сравнения с DeepSeek.
- Использование подписки ChatGPT как бэкенда автоматизированного сервиса —
  серая зона правил OpenAI. Мост работает под личным аккаунтом пользователя,
  риск на аккаунте. Пользователь осведомлён и согласен.

## Ограничение номер один: Amnezia не должна пострадать

На VPS работают контейнеры `amnezia-awg2` (UDP 31695), `shadowbox`,
`outline-ss-server` (TCP/UDP 28742), `watchtower`, а также процесс `node` на
портах 6338 и 9091 и `prometheus` на 127.0.0.1:9090. Политика iptables INPUT —
ACCEPT, ufw и nftables не установлены, правила фаервола пишет только Docker.

Гарантии этой работы:

- Не выполняется ни одной команды, меняющей состояние Docker: ни `docker
  run/stop/rm/restart`, ни `docker compose`, ни обновление пакета Docker.
  Разрешено только `docker ps` для слепков.
- Не меняются iptables, nftables, ufw, sysctl, сетевые интерфейсы, DNS,
  `/etc/hosts`. Не ставится и не включается фаервол.
- Не открывается ни один новый порт наружу: мост слушает только
  `127.0.0.1:8787`, а прод приходит к нему через SSH-туннель по уже
  открытому порту 22.
- Не делается `apt upgrade`, перезагрузка сервера и перезапуск `sshd` (ключ
  для туннеля добавляется в `authorized_keys`, конфиг sshd не трогается).
- Не трогаются `/opt/amnezia`, `/root/.ssh` (кроме уже добавленного ключа) и
  домашние папки существующих пользователей.
- Бюджет ресурсов: бинарник Codex около 100 МБ на диске, один процесс
  `codex exec` в момент запроса. Одновременность запросов — один, чтобы не
  вытеснять память у VPN.
- До начала работ и после каждого этапа снимается слепок: `docker ps`,
  `iptables -S`, `iptables -t nat -S`, `ss -tlnup`, `free -m`, `df -h /`.
  Слепки сравниваются; расхождение в чём-либо, кроме появления
  `127.0.0.1:8787` и процесса моста, останавливает работу.
- Откат: `systemctl disable --now codex-bridge`, удаление
  `/opt/codex-bridge`, `/etc/codex-bridge`, пользователя `codexbridge` с его
  домашней папкой и строки ключа туннеля в `authorized_keys`. Ничего из
  этого не пересекается с Amnezia.

## Архитектура

```
прод (Timeweb, RU)                          VPS (HostVDS, NL)
lib/ai-localization.ts                       codex-bridge.service (Python)
  AI_PROVIDER=codex                            127.0.0.1:8787
  CODEX_BRIDGE_URL=http://127.0.0.1:8787  ──►  POST /v1/chat/completions
        │                                        │ subprocess
        │  codex-bridge-tunnel.service           ▼
        └── ssh -N -L 8787:127.0.0.1:8787 ──►  codex exec --model <model>
            (ключ только на проброс порта)      ~codexbridge/.codex/auth.json
                                                 (логин ChatGPT Pro)
```

Три независимых блока: мост на VPS, туннель, провайдер в коде сайта. Каждый
проверяется отдельно.

## Мост на VPS

**Пользователь.** Системный пользователь `codexbridge` без прав sudo, домашняя
папка `/home/codexbridge`. В ней Codex хранит `~/.codex/auth.json` и
`~/.codex/config.toml`. Логин делается от этого пользователя: `sudo -u
codexbridge codex login --device-auth`; код подтверждает пользователь на своём
устройстве.

**Бинарник.** `/usr/local/bin/codex` из GitHub-релиза `openai/codex`,
версия фиксируется в `/etc/codex-bridge/env` (`CODEX_VERSION`), чтобы
обновление было осознанным. Скачивание — `curl` с проверкой, что архив
распаковался и `codex --version` печатает ожидаемую версию.

**Сервис.** `/opt/codex-bridge/bridge.py`, Python 3.12, только стандартная
библиотека (`http.server`, `subprocess`, `json`, `threading`). Юнит
`/etc/systemd/system/codex-bridge.service`: `User=codexbridge`,
`EnvironmentFile=/etc/codex-bridge/env`, `Restart=always`,
`MemoryMax=400M`. Слушает `127.0.0.1:8787`.

Переменные в `/etc/codex-bridge/env` (права 0640, владелец root, группа
`codexbridge`):

- `CODEX_BRIDGE_TOKEN` — случайные 32 байта в hex, тот же токен на проде.
- `CODEX_BRIDGE_DEFAULT_MODEL=gpt-5.3-codex-spark`.
- `CODEX_BRIDGE_ALLOWED_MODELS=gpt-5.3-codex-spark` — через запятую; модель
  вне списка даёт 400. Новая модель добавляется сюда без правки кода.
- `CODEX_BRIDGE_TIMEOUT_SEC=120`.
- `CODEX_VERSION` — для скрипта установки и `/healthz`.

**Выполнение запроса.** Мост собирает один текстовый промпт: текст system,
пустая строка, текст user. В JSON-режиме добавляет строку «Ответь только
валидным JSON без markdown и пояснений». Запускает:

```
codex exec --model <model> --sandbox read-only --skip-git-repo-check \
  -C /home/codexbridge/work --color never --output-last-message <tmp> -
```

Промпт подаётся через stdin, ответ читается из файла последнего сообщения.
Точные имена флагов сверяются с `codex exec --help` установленной версии
при реализации; смысл фиксирован: модель, sandbox только чтение, пустая
рабочая папка, ответ в файл. Рабочая папка `work` пустая, чтобы модели
нечего было читать. Ненулевой код
выхода, пустой ответ или таймаут превращаются в HTTP 502 с текстом stderr
(обрезанным до 2 КБ) в поле `error.message`. Одновременность: `threading.Lock`
вокруг вызова; запросы, ждущие дольше `CODEX_BRIDGE_TIMEOUT_SEC`, получают 503.

**Контракт.**

`GET /healthz` без авторизации, только с localhost: `{ "ok": true,
"codexVersion": "...", "loggedIn": true|false, "defaultModel": "..." }`.
`loggedIn` — наличие `auth.json` у пользователя `codexbridge`.

`POST /v1/chat/completions`, заголовок `Authorization: Bearer <токен>`,
иначе 401. Тело:

```json
{
  "model": "gpt-5.3-codex-spark",
  "messages": [{ "role": "system", "content": "..." }, { "role": "user", "content": "..." }],
  "response_format": { "type": "json_object" },
  "temperature": 0.2
}
```

`model` необязателен (берётся default), `temperature` принимается и
игнорируется (Codex CLI её не пробрасывает). Ответ:

```json
{
  "id": "bridge-<uuid>",
  "object": "chat.completion",
  "model": "gpt-5.3-codex-spark",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "..." }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

Формат намеренно совпадает с DeepSeek, чтобы `sendOpenAiCompatibleJsonPrompt`
в `lib/ai-localization.ts` работал без изменений. В JSON-режиме мост
дополнительно снимает markdown-ограждение ```` ```json ````, если модель его
всё же добавила.

## Туннель прод → VPS

- На проде: ключ `/root/.ssh/codex_bridge_tunnel` (ed25519, без пароля).
- На VPS в `/home/codexbridge/.ssh/authorized_keys` его публичная часть с
  опциями `restrict,port-forwarding,permitopen="127.0.0.1:8787"` — шелл,
  команды и другие пробросы недоступны.
- На проде юнит `/etc/systemd/system/codex-bridge-tunnel.service`:
  `ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o
  ServerAliveCountMax=3 -o StrictHostKeyChecking=yes -i
  /root/.ssh/codex_bridge_tunnel -L 127.0.0.1:8787:127.0.0.1:8787
  codexbridge@31.59.185.86`, `Restart=always`, `RestartSec=5`. Отпечаток
  хоста VPS заранее в `known_hosts`.
- В `/opt/fightbase/.env` прода: `CODEX_BRIDGE_URL=http://127.0.0.1:8787`,
  `CODEX_BRIDGE_TOKEN=<тот же>`, `CODEX_BRIDGE_MODEL=gpt-5.3-codex-spark`.
  `AI_PROVIDER` остаётся прежним до решения по эксперименту.

## Код сайта

`lib/ai-localization.ts`:

- Конфиг провайдера: `{ name: "deepseek" | "codex"; baseUrl; apiKey; model }`.
  Геттеры `getDeepSeekProvider()` и `getCodexBridgeProvider()` читают env; для
  моста `apiKey` — это `CODEX_BRIDGE_TOKEN`.
- `localizeWithDeepSeek` и `rewriteWithDeepSeek` переименовываются в
  `localizeWithOpenAiCompatible(provider, input)` и
  `rewriteWithOpenAiCompatible(provider, input)`; промпты, проверка на
  украинский, ремонт красных флагов не меняются. DeepSeek вызывает их со
  своим конфигом, поведение прода без `AI_PROVIDER=codex` бит в бит прежнее.
- `localizeIngestionInput`: при `AI_PROVIDER=codex` и заполненных
  `CODEX_BRIDGE_URL`/`CODEX_BRIDGE_TOKEN` сначала мост; при ошибке —
  `console.error("Codex bridge ... failed, falling back to DeepSeek")` и
  существующая цепочка DeepSeek → OpenAI → исходный текст. То же для ветки
  русского рерайта.
- `localizeIngestionInput` получает необязательный второй аргумент
  `{ provider?: "codex" | "deepseek" }`, который переопределяет env. Нужен
  скрипту сравнения, чтобы прогнать один вход через оба провайдера в одном
  процессе.
- Таймаут запроса к мосту 150 секунд (больше `CODEX_BRIDGE_TIMEOUT_SEC`,
  чтобы ошибка приходила от моста с текстом, а не как обрыв).
- Дайджест для Telegram (`generateTelegramDigestForArticle`) и тексты прогнозов
  на этом этапе не трогаются, остаются на DeepSeek.

`lib/env.ts`: флаг `hasCodexBridge` рядом с `hasOpenAiKey`, для админки и
health.

## Эксперимент: Spark против DeepSeek

- `scripts/discover-weekly-news.js` получает флаг `--dump <файл>`: вместо
  отправки черновиков в `/api/ingest/draft` пишет найденные элементы
  (`headline`, `body`, `sourceLabel`, `sourceUrl`, `publishedAt`,
  `category`) в JSON. Существующие режимы не меняются.
- Новый `scripts/compare-ai-providers.js`: читает JSON, берёт первые N (по
  умолчанию 10), для каждого вызывает `localizeIngestionInput` с
  `provider: "codex"` и с `provider: "deepseek"`, замеряет время, ловит
  ошибки. Пишет `ops/reports/ai-compare-<дата>.md`: на каждый вход блок с
  исходным заголовком и ссылкой, затем две колонки-секции «Spark» и
  «DeepSeek» с заголовком, текстом, `interestScore`, временем и ошибкой,
  если была. В конце сводка: число ошибок, среднее время, средняя длина
  текста по провайдерам.
- Запуск на проде: `node scripts/discover-weekly-news.js --dump /tmp/items.json
  --days 3`, затем `node scripts/compare-ai-providers.js /tmp/items.json`.
  Отчёт копируется пользователю. Решение о переключении `AI_PROVIDER=codex`
  принимает пользователь по отчёту; до этого прод работает как раньше.

## Отказы

| Ситуация | Поведение |
| --- | --- |
| Туннель упал | `ECONNREFUSED` на проде → фолбэк на DeepSeek; systemd поднимает туннель через 5 с |
| Мост упал / VPS недоступен | То же |
| Лимит Spark исчерпан | `codex exec` завершается с ошибкой → мост отдаёт 502 с текстом → фолбэк на DeepSeek, текст ошибки в логе |
| Модель переименована или убрана | 502 с текстом от Codex → фолбэк; лечится правкой `CODEX_BRIDGE_ALLOWED_MODELS`, `CODEX_BRIDGE_DEFAULT_MODEL`, `CODEX_BRIDGE_MODEL` |
| Логин протух | `codex exec` просит логин → 502; `/healthz` покажет `loggedIn: false` → повторный `codex login --device-auth` |
| Ответ не JSON | `parseLocalizationResponse` бросает ошибку, как для DeepSeek → фолбэк |
| Нехватка памяти на VPS | `MemoryMax=400M` на юните моста; VPN-контейнеры вне этого лимита |

Все фолбэки логируются через `console.error`, как соседние ветки. Отдельная
метрика не заводится: провайдер результата и так пишется в `model` записи.

## Тестирование

- **Мост:** `ops/codex-bridge/test_bridge.py` (unittest). Подменный
  исполняемый `codex` — shell-скрипт, который пишет stdin во временный файл и
  отвечает заранее заданным текстом или падает с кодом 1. Проверяется: 401
  без токена, 400 на неразрешённую модель, сборка промпта (system, пустая
  строка, user, JSON-инструкция), формат ответа, снятие markdown-ограждения,
  502 при падении `codex`, 503 при занятом замке.
- **Сайт:** `tests/ai-localization-provider.test.ts` через `node --test`:
  выбор провайдера по env и по аргументу, фолбэк на DeepSeek при ошибке моста,
  неизменность поведения без `AI_PROVIDER=codex`. HTTP подменяется через
  `globalThis.fetch`, как в соседних тестах.
- **Скрипты:** `tests/compare-ai-providers.test.ts` на формат отчёта из
  подменных результатов; `--dump` проверяется на одном источнике вручную.
- **Смоук после развёртывания:** с VPS `curl 127.0.0.1:8787/healthz`; с прода
  `curl` через туннель на `/healthz` и один настоящий запрос с коротким
  промптом; `npm run build`, `npm test`, `npm run test:smoke` на проде перед
  переключением провайдера.

## Порядок работ

1. Слепок VPS. Пользователь `codexbridge`, бинарник Codex, `codex login
   --device-auth` (код подтверждает пользователь). Сервис моста, тест моста,
   `/healthz`. Слепок и сверка.
2. Ключ и юнит туннеля на проде, запись ключа на VPS. Смоук через туннель.
   Слепок и сверка.
3. Код сайта и тесты. Деплой через push в `master` (автодеплой). Прод
   по-прежнему на DeepSeek.
4. `--dump`, скрипт сравнения, отчёт пользователю.
5. Решение пользователя. При «да»: `AI_PROVIDER=codex` в `.env` прода и
   перезапуск `fightbase.service`. При «нет»: мост остаётся выключенным
   (`systemctl disable --now`), код с провайдером остаётся для будущих
   моделей.

## Вне объёма

- Egress-прокси для платного OpenAI API.
- Правка Chrome-заголовков для картинок ufc.com (отдельный коммит).
- Перевод дайджеста Telegram и текстов прогнозов на мост.
- Стриминг, история диалогов, `codex-app-server`.
