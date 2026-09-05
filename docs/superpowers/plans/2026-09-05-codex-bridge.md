# Мост к Codex на VPS — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать сайту AI-провайдер `codex`, который ходит на VPS в Амстердаме, где Codex CLI под подпиской ChatGPT Pro выполняет промпты моделью `gpt-5.3-codex-spark`; сравнить его с DeepSeek на реальных новостях и дать пользователю данные для решения о переключении.

**Architecture:** На VPS маленький Python-сервис (только стандартная библиотека) принимает запросы в формате OpenAI chat completions и запускает `codex exec`. Прод достаёт его через SSH-туннель на `127.0.0.1:8787`. В `lib/ai-localization.ts` DeepSeek-ветки обобщаются до «любой OpenAI-совместимый провайдер», и мост становится вторым конфигом с фолбэком на DeepSeek.

**Tech Stack:** Python 3.12 stdlib + `unittest` (мост), systemd, OpenSSH, Node 20 + TypeScript, тесты `node:test` через `tsx`, Prisma только в скрипте discovery.

**Спека:** `docs/superpowers/specs/2026-09-05-codex-bridge-design.md`

---

## Важный контекст

**Amnezia на VPS трогать нельзя.** Никаких `docker run/stop/rm/restart/compose`, никаких `iptables`, `ufw`, `nft`, `sysctl`, `apt upgrade`, `reboot`, правок `sshd_config`. Разрешены только `docker ps` и чтение. Перед и после каждой задачи на VPS снимается слепок `ops/codex-bridge/snapshot.sh`; допустимые отличия — новый пользователь `codexbridge`, новый слушающий `127.0.0.1:8787`, новый бинарник. Любое другое отличие — стоп и разбор.

**Доступ.** VPS: `ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86` (Ubuntu 24.04, 1 ядро, 961 МБ, Python 3.12, Node нет, iptables INPUT ACCEPT, ufw нет). Прод: `ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru`, приложение `/opt/fightbase`, юнит `fightbase.service` (User=fightbase, `EnvironmentFile=/opt/fightbase/.env`), Node 20, `tsx` в `node_modules`. Публичный IP прода `176.124.219.75`.

**Codex CLI.** Локально стоит `codex-cli 0.142.0`, на VPS ставим релиз `rust-v0.153.4` (последний на 04.09.2026), бинарник `codex-x86_64-unknown-linux-musl.tar.gz`. Проверенные флаги `codex exec`: `-m/--model`, `-s/--sandbox read-only`, `-C/--cd`, `--skip-git-repo-check`, `--ephemeral`, `--color never`, `-o/--output-last-message <FILE>`, промпт `-` читается из stdin. `codex login status` печатает `Logged in using ChatGPT` и выходит с кодом 0; `codex login --device-auth` — вход без браузера, требует включённого в ChatGPT «Settings → Security → Device code authorization».

**Транспорт AI в коде — не `fetch`.** `postJson` в `lib/ai-localization.ts` ходит через `node:http`/`node:https` с таймаутом 180 с. Поэтому в тестах мост и DeepSeek подменяются настоящим локальным `http.createServer`, а не `globalThis.fetch`.

**Чтение env.** `getEnvValue` в `lib/ai-localization.ts` берёт `process.env[name]`, а при пустом значении читает `.env` из `process.cwd()`. В тестах все нужные переменные задаются в `process.env` непустыми строками; локальный `.env` содержит `DEEPSEEK_*`, поэтому тесты обязаны переопределять `DEEPSEEK_BASE_URL` и `DEEPSEEK_API_KEY`.

**Ветка.** Текущая `feat/espn-roster-backfill` содержит 8 незалитых коммитов по ESPN. Работа идёт в новой ветке `feat/codex-bridge` от `origin/master`, спека переносится cherry-pick.

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `ops/codex-bridge/bridge.py` | Создать. HTTP-мост: авторизация, сборка промпта, `codex exec`, ответ в формате chat completions, `/healthz`. |
| `ops/codex-bridge/fake_codex.py` | Создать. Подменный `codex` для тестов моста. |
| `ops/codex-bridge/test_bridge.py` | Создать. `unittest` для моста. |
| `ops/codex-bridge/codex-bridge.service` | Создать. systemd-юнит моста (VPS). |
| `ops/codex-bridge/env.example` | Создать. Шаблон `/etc/codex-bridge/env`. |
| `ops/codex-bridge/install-vps.sh` | Создать. Идемпотентная установка на VPS: пользователь, бинарник, файлы, юнит. |
| `ops/codex-bridge/snapshot.sh` | Создать. Слепок состояния VPS. |
| `ops/codex-bridge/codex-bridge-tunnel.service` | Создать. systemd-юнит туннеля (прод). |
| `ops/codex-bridge/README.md` | Создать. Как логиниться заново, менять модель, откатывать. |
| `lib/ai-localization.ts` | Изменить. Конфиг провайдера, обобщённые `localizeWithOpenAiCompatible`/`rewriteWithOpenAiCompatible`, провайдер `codex`, аргумент-переопределение. |
| `lib/env.ts` | Изменить. `hasCodexBridge`. |
| `tests/ai-localization-provider.test.ts` | Создать. Выбор провайдера, фолбэк, строгий режим. |
| `scripts/discover-weekly-news.js` | Изменить. Флаг `--dump <файл>`. |
| `scripts/ai-compare-report.ts` | Создать. Чистая сборка markdown-отчёта. |
| `scripts/compare-ai-providers.ts` | Создать. Прогон входов через оба провайдера. |
| `tests/ai-compare-report.test.ts` | Создать. Формат отчёта. |
| `.gitignore` | Изменить. `ops/reports/`. |
| `.env.example` | Изменить. Переменные `CODEX_BRIDGE_*`. |

---

### Task 0: Ветка

**Files:** нет.

- [ ] **Step 1: Создать ветку от master и перенести спеку**

```bash
git fetch origin
git switch -c feat/codex-bridge origin/master
git cherry-pick e4576e6 feat/espn-roster-backfill
git log --oneline -3
```

Expected: сверху коммиты плана и спеки (`docs(ai): план реализации...`, `docs(ai): дизайн моста...`), под ними последний коммит `origin/master`.

---

### Task 1: Слепок VPS и скрипт слепка

**Files:**
- Create: `ops/codex-bridge/snapshot.sh`

- [ ] **Step 1: Написать скрипт слепка**

```sh
#!/bin/sh
# Слепок состояния VPS для сверки до/после работ. Только чтение.
set -u
echo "## docker"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | sort
echo "## iptables"
iptables -S
iptables -t nat -S
echo "## listening"
ss -tlnupH | awk '{print $1, $5}' | sort -u
echo "## users"
cut -d: -f1 /etc/passwd | sort | tr '\n' ' '
echo
echo "## units"
systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}' | sort
echo "## resources"
free -m | sed -n '1,2p'
df -h / | tail -n 1
```

- [ ] **Step 2: Снять слепок «до» и сохранить локально**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'sh -s' < ops/codex-bridge/snapshot.sh > "$SCRATCH/vps-before.txt"
grep -c . "$SCRATCH/vps-before.txt"
```

`$SCRATCH` — папка scratchpad сессии. Expected: в разделе `## docker` три контейнера `amnezia-awg2`, `shadowbox`, `watchtower`; в `## listening` нет `8787`.

- [ ] **Step 3: Commit**

```bash
git add ops/codex-bridge/snapshot.sh
git commit -m "ops(codex-bridge): скрипт слепка состояния VPS"
```

---

### Task 2: Мост — тесты и реализация

**Files:**
- Create: `ops/codex-bridge/fake_codex.py`
- Create: `ops/codex-bridge/test_bridge.py`
- Create: `ops/codex-bridge/bridge.py`

- [ ] **Step 1: Подменный codex**

`ops/codex-bridge/fake_codex.py`:

```python
"""Подменный codex для тестов моста. Поведение задаётся переменными окружения:
FAKE_CODEX_MODE = ok | fail | slow, FAKE_CODEX_ANSWER — текст ответа,
FAKE_CODEX_PROMPT_FILE — куда записать полученный промпт."""
import os
import sys
import time

args = sys.argv[1:]

if args[:1] == ["--version"]:
    print("codex-cli 0.0.0-fake")
    sys.exit(0)

if args[:2] == ["login", "status"]:
    if os.environ.get("FAKE_CODEX_LOGGED_IN", "1") == "1":
        print("Logged in using ChatGPT")
        sys.exit(0)
    print("Not logged in", file=sys.stderr)
    sys.exit(1)

out_path = args[args.index("--output-last-message") + 1]
prompt = sys.stdin.read()
prompt_file = os.environ.get("FAKE_CODEX_PROMPT_FILE")
if prompt_file:
    with open(prompt_file, "w", encoding="utf-8") as handle:
        handle.write(prompt)

mode = os.environ.get("FAKE_CODEX_MODE", "ok")
if mode == "fail":
    sys.stderr.write("boom: rate limit reached\n")
    sys.exit(1)
if mode == "slow":
    time.sleep(float(os.environ.get("FAKE_CODEX_SLEEP", "1.5")))

with open(out_path, "w", encoding="utf-8") as handle:
    handle.write(os.environ.get("FAKE_CODEX_ANSWER", "hello"))
```

- [ ] **Step 2: Тесты моста (падающие)**

`ops/codex-bridge/test_bridge.py`:

```python
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bridge  # noqa: E402

FAKE = [sys.executable, os.path.join(HERE, "fake_codex.py")]


def post(url, body, token="test-token"):
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    if token is not None:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.prompt_file = os.path.join(self.tmp.name, "prompt.txt")
        os.environ["FAKE_CODEX_PROMPT_FILE"] = self.prompt_file
        os.environ["FAKE_CODEX_MODE"] = "ok"
        os.environ["FAKE_CODEX_ANSWER"] = "plain answer"
        os.environ["FAKE_CODEX_LOGGED_IN"] = "1"
        self.config = bridge.build_config(
            {
                "CODEX_BRIDGE_TOKEN": "test-token",
                "CODEX_BRIDGE_DEFAULT_MODEL": "gpt-5.3-codex-spark",
                "CODEX_BRIDGE_ALLOWED_MODELS": "gpt-5.3-codex-spark,other-model",
                "CODEX_BRIDGE_TIMEOUT_SEC": "5",
                "CODEX_BRIDGE_QUEUE_WAIT_SEC": "0.2",
                "CODEX_BRIDGE_WORK_DIR": os.path.join(self.tmp.name, "work"),
                "CODEX_BRIDGE_PORT": "0",
            }
        )
        self.config["codex_cmd"] = FAKE
        self.server = bridge.make_server(self.config)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def completions(self, body, token="test-token"):
        return post(f"{self.base}/v1/chat/completions", body, token)

    def messages(self):
        return [
            {"role": "system", "content": "SYSTEM PROMPT"},
            {"role": "user", "content": "USER PROMPT"},
        ]

    def test_rejects_missing_or_wrong_token(self):
        status, payload = self.completions({"messages": self.messages()}, token=None)
        self.assertEqual(status, 401)
        self.assertIn("error", payload)
        status, _ = self.completions({"messages": self.messages()}, token="wrong")
        self.assertEqual(status, 401)

    def test_rejects_model_outside_allowlist(self):
        status, payload = self.completions({"model": "gpt-99", "messages": self.messages()})
        self.assertEqual(status, 400)
        self.assertIn("gpt-99", payload["error"]["message"])

    def test_builds_prompt_and_returns_completion(self):
        os.environ["FAKE_CODEX_ANSWER"] = "```json\n{\"headline\": \"x\"}\n```"
        status, payload = self.completions(
            {
                "messages": self.messages(),
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            }
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["object"], "chat.completion")
        self.assertEqual(payload["model"], "gpt-5.3-codex-spark")
        self.assertEqual(payload["choices"][0]["message"]["content"], '{"headline": "x"}')
        self.assertEqual(payload["choices"][0]["finish_reason"], "stop")
        with open(self.prompt_file, encoding="utf-8") as handle:
            prompt = handle.read()
        self.assertEqual(prompt, "SYSTEM PROMPT\n\nUSER PROMPT\n\n" + bridge.JSON_INSTRUCTION)

    def test_plain_mode_keeps_answer_untouched(self):
        os.environ["FAKE_CODEX_ANSWER"] = "```json\n{}\n```"
        status, payload = self.completions({"model": "other-model", "messages": self.messages()})
        self.assertEqual(status, 200)
        self.assertEqual(payload["model"], "other-model")
        self.assertEqual(payload["choices"][0]["message"]["content"], "```json\n{}\n```")
        with open(self.prompt_file, encoding="utf-8") as handle:
            self.assertEqual(handle.read(), "SYSTEM PROMPT\n\nUSER PROMPT")

    def test_returns_502_when_codex_fails(self):
        os.environ["FAKE_CODEX_MODE"] = "fail"
        status, payload = self.completions({"messages": self.messages()})
        self.assertEqual(status, 502)
        self.assertIn("rate limit reached", payload["error"]["message"])

    def test_returns_503_when_busy(self):
        os.environ["FAKE_CODEX_MODE"] = "slow"
        os.environ["FAKE_CODEX_SLEEP"] = "1.5"
        results = []

        def call():
            results.append(self.completions({"messages": self.messages()})[0])

        first = threading.Thread(target=call)
        second = threading.Thread(target=call)
        first.start()
        threading.Event().wait(0.3)
        second.start()
        first.join()
        second.join()
        self.assertEqual(sorted(results), [200, 503])

    def test_healthz_reports_version_and_login(self):
        with urllib.request.urlopen(f"{self.base}/healthz", timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        self.assertEqual(payload["ok"], True)
        self.assertEqual(payload["codexVersion"], "codex-cli 0.0.0-fake")
        self.assertEqual(payload["loggedIn"], True)
        self.assertEqual(payload["defaultModel"], "gpt-5.3-codex-spark")

    def test_build_prompt_joins_multiple_messages(self):
        prompt = bridge.build_prompt(
            [
                {"role": "system", "content": "A"},
                {"role": "system", "content": "B"},
                {"role": "user", "content": "C"},
                {"role": "user", "content": "D"},
            ],
            json_mode=False,
        )
        self.assertEqual(prompt, "A\n\nB\n\nC\n\nD")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Запустить тесты, убедиться, что падают**

Run: `python ops/codex-bridge/test_bridge.py -v`
Expected: `ModuleNotFoundError: No module named 'bridge'`.

- [ ] **Step 4: Реализация моста**

`ops/codex-bridge/bridge.py`:

```python
#!/usr/bin/env python3
"""Codex bridge: OpenAI-совместимые chat completions поверх `codex exec`.

Слушает только 127.0.0.1. Один запрос за раз (замок), остальные ждут
CODEX_BRIDGE_QUEUE_WAIT_SEC и получают 503. Любая ошибка codex → 502 с текстом.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

JSON_INSTRUCTION = "Ответь только валидным JSON без markdown-ограждений и пояснений."
FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S)
STDERR_TAIL = 2000


def build_config(env):
    timeout = float(env.get("CODEX_BRIDGE_TIMEOUT_SEC", "120"))
    allowed = [m.strip() for m in env.get("CODEX_BRIDGE_ALLOWED_MODELS", "gpt-5.3-codex-spark").split(",") if m.strip()]
    return {
        "token": env.get("CODEX_BRIDGE_TOKEN", ""),
        "default_model": env.get("CODEX_BRIDGE_DEFAULT_MODEL", "gpt-5.3-codex-spark"),
        "allowed_models": allowed,
        "timeout_sec": timeout,
        "queue_wait_sec": float(env.get("CODEX_BRIDGE_QUEUE_WAIT_SEC", str(timeout))),
        "codex_cmd": [env.get("CODEX_BRIDGE_CODEX_BIN", "codex")],
        "work_dir": env.get("CODEX_BRIDGE_WORK_DIR", os.path.join(os.path.expanduser("~"), "work")),
        "host": "127.0.0.1",
        "port": int(env.get("CODEX_BRIDGE_PORT", "8787")),
    }


def build_prompt(messages, json_mode):
    system = [m.get("content", "") for m in messages if m.get("role") == "system" and m.get("content")]
    user = [m.get("content", "") for m in messages if m.get("role") != "system" and m.get("content")]
    parts = system + user
    if json_mode:
        parts.append(JSON_INSTRUCTION)
    return "\n\n".join(parts)


def strip_fence(text):
    match = FENCE_RE.match(text)
    return match.group(1) if match else text


def run_codex(config, model, prompt):
    """Возвращает (text, error). Ровно одно из двух не None."""
    os.makedirs(config["work_dir"], exist_ok=True)
    handle = tempfile.NamedTemporaryFile(prefix="codex-bridge-", suffix=".txt", delete=False)
    out_path = handle.name
    handle.close()
    cmd = config["codex_cmd"] + [
        "exec",
        "--model", model,
        "--sandbox", "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--color", "never",
        "-C", config["work_dir"],
        "--output-last-message", out_path,
        "-",
    ]
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=config["timeout_sec"],
            cwd=config["work_dir"],
        )
    except subprocess.TimeoutExpired:
        _remove(out_path)
        return None, f"codex exec timed out after {config['timeout_sec']:.0f}s"
    except OSError as error:
        _remove(out_path)
        return None, f"failed to start codex: {error}"

    text = ""
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8", errors="replace") as out:
            text = out.read()
    _remove(out_path)
    stderr_tail = (proc.stderr or "")[-STDERR_TAIL:]
    if proc.returncode != 0:
        return None, f"codex exec exited with {proc.returncode}: {stderr_tail}".strip()
    if not text.strip():
        return None, f"codex exec returned an empty answer: {stderr_tail}".strip()
    return text.strip(), None


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def codex_version(config):
    try:
        proc = subprocess.run(config["codex_cmd"] + ["--version"], capture_output=True, text=True, timeout=15)
        return (proc.stdout or proc.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as error:
        return f"unavailable: {error}"


def codex_logged_in(config):
    try:
        proc = subprocess.run(config["codex_cmd"] + ["login", "status"], capture_output=True, text=True, timeout=15)
        return proc.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "codex-bridge/1"

    def log_message(self, fmt, *args):  # journald получает одну строку на запрос из _log
        pass

    def _log(self, status, extra=""):
        print(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {self.command} {self.path} {status} {extra}".rstrip(), flush=True)

    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message, extra=""):
        self._log(status, extra or message[:120])
        self._send(status, {"error": {"message": message, "type": "bridge_error"}})

    def do_GET(self):
        config = self.server.config
        if self.path != "/healthz":
            return self._error(404, "not found")
        self._log(200)
        self._send(
            200,
            {
                "ok": True,
                "codexVersion": codex_version(config),
                "loggedIn": codex_logged_in(config),
                "defaultModel": config["default_model"],
                "allowedModels": config["allowed_models"],
            },
        )

    def do_POST(self):
        config = self.server.config
        if self.path != "/v1/chat/completions":
            return self._error(404, "not found")
        expected = f"Bearer {config['token']}"
        if not config["token"] or self.headers.get("Authorization", "") != expected:
            return self._error(401, "invalid bearer token")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as error:
            return self._error(400, f"invalid JSON body: {error}")
        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            return self._error(400, "messages must be a non-empty list")
        model = body.get("model") or config["default_model"]
        if model not in config["allowed_models"]:
            return self._error(400, f"model {model} is not allowed; allowed: {', '.join(config['allowed_models'])}")
        response_format = body.get("response_format") or {}
        json_mode = isinstance(response_format, dict) and response_format.get("type") == "json_object"
        prompt = build_prompt(messages, json_mode)

        if not self.server.lock.acquire(timeout=config["queue_wait_sec"]):
            return self._error(503, "bridge is busy, retry later", extra=model)
        started = time.monotonic()
        try:
            text, error = run_codex(config, model, prompt)
        finally:
            self.server.lock.release()
        elapsed = f"{time.monotonic() - started:.1f}s {model}"
        if error:
            return self._error(502, error, extra=elapsed)
        if json_mode:
            text = strip_fence(text)
        self._log(200, elapsed)
        self._send(
            200,
            {
                "id": f"bridge-{uuid.uuid4()}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [
                    {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
                ],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            },
        )


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, config):
        super().__init__((config["host"], config["port"]), BridgeHandler)
        self.config = config
        self.lock = threading.Lock()


def make_server(config):
    return BridgeServer(config)


def main():
    config = build_config(os.environ)
    if not config["token"]:
        print("CODEX_BRIDGE_TOKEN is empty, refusing to start", file=sys.stderr)
        sys.exit(2)
    server = make_server(config)
    print(f"codex-bridge listening on {config['host']}:{server.server_address[1]} default model {config['default_model']}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Запустить тесты, убедиться, что проходят**

Run: `python ops/codex-bridge/test_bridge.py -v`
Expected: `Ran 8 tests ... OK`. Если `test_returns_503_when_busy` мигает, увеличить `FAKE_CODEX_SLEEP` до `2.5`, не трогать замок.

- [ ] **Step 6: Commit**

```bash
git add ops/codex-bridge/bridge.py ops/codex-bridge/fake_codex.py ops/codex-bridge/test_bridge.py
git commit -m "ops(codex-bridge): HTTP-мост поверх codex exec с тестами"
```

---

### Task 3: Файлы развёртывания моста

**Files:**
- Create: `ops/codex-bridge/codex-bridge.service`
- Create: `ops/codex-bridge/env.example`
- Create: `ops/codex-bridge/install-vps.sh`
- Create: `ops/codex-bridge/README.md`

- [ ] **Step 1: systemd-юнит моста**

`ops/codex-bridge/codex-bridge.service`:

```ini
[Unit]
Description=Codex bridge (OpenAI-compatible chat completions over codex exec)
After=network.target

[Service]
User=codexbridge
Group=codexbridge
EnvironmentFile=/etc/codex-bridge/env
Environment=HOME=/home/codexbridge
Environment=PYTHONUNBUFFERED=1
WorkingDirectory=/home/codexbridge
ExecStart=/usr/bin/python3 /opt/codex-bridge/bridge.py
Restart=always
RestartSec=3
MemoryMax=400M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Шаблон env**

`ops/codex-bridge/env.example`:

```sh
# /etc/codex-bridge/env — права 0640 root:codexbridge
CODEX_VERSION=0.153.4
CODEX_BRIDGE_TOKEN=replace-with-openssl-rand-hex-32
CODEX_BRIDGE_DEFAULT_MODEL=gpt-5.3-codex-spark
CODEX_BRIDGE_ALLOWED_MODELS=gpt-5.3-codex-spark
CODEX_BRIDGE_TIMEOUT_SEC=120
CODEX_BRIDGE_WORK_DIR=/home/codexbridge/work
CODEX_BRIDGE_PORT=8787
```

- [ ] **Step 3: Скрипт установки**

`ops/codex-bridge/install-vps.sh` (запускается на VPS от root из папки с файлами моста, идемпотентен):

```bash
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

# shellcheck disable=SC1090
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
```

- [ ] **Step 4: README**

`ops/codex-bridge/README.md`:

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add ops/codex-bridge/codex-bridge.service ops/codex-bridge/env.example ops/codex-bridge/install-vps.sh ops/codex-bridge/README.md
git commit -m "ops(codex-bridge): юнит, env и установка на VPS"
```

---

### Task 4: Развернуть мост на VPS и залогиниться

**Files:** нет (операции на VPS).

- [ ] **Step 1: Скопировать файлы и поставить**

Перед скачиванием сообщить пользователю: файл `codex-x86_64-unknown-linux-musl.tar.gz` с github.com/openai/codex, релиз rust-v0.153.4, размер по факту из `curl -sI`.

```bash
scp -i ~/.ssh/fightbase_deploy -r ops/codex-bridge root@31.59.185.86:/root/codex-bridge-src
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'bash /root/codex-bridge-src/install-vps.sh'
```

Expected: `codex-cli 0.153.4`, статус `active (running)`, `/healthz` с `"loggedIn": false`.

- [ ] **Step 2: Прогнать тесты моста на VPS**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'cd /root/codex-bridge-src && python3 test_bridge.py -v 2>&1 | tail -n 3'
```

Expected: `OK`.

- [ ] **Step 3: Логин (делает пользователь)**

Попросить пользователя включить Device code authorization в ChatGPT. Затем запустить и передать пользователю код и ссылку из вывода. Команда висит, пока пользователь не подтвердит код, поэтому запускать с таймаутом 10 минут (`timeout: 600000`). Если на VPS нет `sudo`, использовать `runuser -u codexbridge -- codex login --device-auth`.

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'sudo -H -u codexbridge codex login --device-auth'
```

Expected после подтверждения: `Logged in using ChatGPT`; `curl -s 127.0.0.1:8787/healthz` → `"loggedIn": true`.

- [ ] **Step 4: Первый настоящий запрос**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'TOKEN=$(grep ^CODEX_BRIDGE_TOKEN= /etc/codex-bridge/env | cut -d= -f2); curl -s -m 150 http://127.0.0.1:8787/v1/chat/completions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"messages\":[{\"role\":\"system\",\"content\":\"Ты редактор.\"},{\"role\":\"user\",\"content\":\"Верни JSON {\\\"text\\\":\\\"ок\\\"}\"}],\"response_format\":{\"type\":\"json_object\"}}"'
```

Expected: HTTP 200, `choices[0].message.content` содержит `"text"`. Если 502 с текстом про модель — проверить имя модели в `codex exec --help`/Codex app и поправить env.

- [ ] **Step 5: Слепок «после» и сверка**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'sh -s' < ops/codex-bridge/snapshot.sh > "$SCRATCH/vps-after-bridge.txt"
diff "$SCRATCH/vps-before.txt" "$SCRATCH/vps-after-bridge.txt"
```

Expected: отличия только `codexbridge` в users, `127.0.0.1:8787` в listening, `codex-bridge.service` в units, память/диск. Разделы `## docker` и `## iptables` без изменений. Иначе — стоп.

---

### Task 5: Туннель прод → VPS

**Files:**
- Create: `ops/codex-bridge/codex-bridge-tunnel.service`

- [ ] **Step 1: Юнит туннеля**

`ops/codex-bridge/codex-bridge-tunnel.service`:

```ini
[Unit]
Description=SSH tunnel to Codex bridge on VPS (127.0.0.1:8787)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/root/.ssh/known_hosts -o BatchMode=yes -i /root/.ssh/codex_bridge_tunnel -L 127.0.0.1:8787:127.0.0.1:8787 codexbridge@31.59.185.86
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Ключ на проде и отпечаток VPS**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'test -f /root/.ssh/codex_bridge_tunnel || ssh-keygen -t ed25519 -N "" -C codex-bridge-tunnel -f /root/.ssh/codex_bridge_tunnel; ssh-keyscan -t ed25519 31.59.185.86 2>/dev/null >> /root/.ssh/known_hosts; sort -u /root/.ssh/known_hosts -o /root/.ssh/known_hosts; cat /root/.ssh/codex_bridge_tunnel.pub'
```

Expected: строка `ssh-ed25519 ... codex-bridge-tunnel`. Сохранить её в `$PUBKEY`.

- [ ] **Step 3: Ключ на VPS с ограничениями**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 "printf '%s\n' 'restrict,port-forwarding,permitopen=\"127.0.0.1:8787\" $PUBKEY' >> /home/codexbridge/.ssh/authorized_keys; chown -R codexbridge:codexbridge /home/codexbridge/.ssh; chmod 700 /home/codexbridge/.ssh; chmod 600 /home/codexbridge/.ssh/authorized_keys; cat /home/codexbridge/.ssh/authorized_keys"
```

Expected: одна строка с `restrict,port-forwarding,permitopen="127.0.0.1:8787"`.

- [ ] **Step 4: Юнит на проде и запуск**

```bash
scp -i ~/.ssh/fightbase_deploy ops/codex-bridge/codex-bridge-tunnel.service root@fightbase.ru:/etc/systemd/system/codex-bridge-tunnel.service
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'systemctl daemon-reload; systemctl enable --now codex-bridge-tunnel; sleep 3; systemctl --no-pager --lines=5 status codex-bridge-tunnel; curl -s -m 20 http://127.0.0.1:8787/healthz'
```

Expected: `active (running)`, `/healthz` с `"loggedIn": true`. Если `Permission denied` — проверить строку в `authorized_keys`; если `channel ... open failed` — `permitopen`.

- [ ] **Step 5: Env на проде**

Токен взять с VPS: `grep ^CODEX_BRIDGE_TOKEN= /etc/codex-bridge/env`. Добавить в `/opt/fightbase/.env` три строки, не трогая остальное и не меняя `AI_PROVIDER`:

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'grep -q ^CODEX_BRIDGE_URL= /opt/fightbase/.env || printf "\nCODEX_BRIDGE_URL=\"http://127.0.0.1:8787\"\nCODEX_BRIDGE_TOKEN=\"<токен>\"\nCODEX_BRIDGE_MODEL=\"gpt-5.3-codex-spark\"\n" >> /opt/fightbase/.env; chown fightbase:fightbase /opt/fightbase/.env; chmod 600 /opt/fightbase/.env; grep -E "^CODEX_BRIDGE_(URL|MODEL)=" /opt/fightbase/.env'
```

Перезапуск `fightbase.service` не нужен до деплоя кода: переменные читаются при следующем старте.

- [ ] **Step 6: Слепок VPS и сверка**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'sh -s' < ops/codex-bridge/snapshot.sh > "$SCRATCH/vps-after-tunnel.txt"
diff "$SCRATCH/vps-after-bridge.txt" "$SCRATCH/vps-after-tunnel.txt"
```

Expected: без отличий, кроме памяти/диска.

- [ ] **Step 7: Commit**

```bash
git add ops/codex-bridge/codex-bridge-tunnel.service
git commit -m "ops(codex-bridge): юнит SSH-туннеля с прода"
```

---

### Task 6: Провайдер `codex` в коде сайта

**Files:**
- Modify: `lib/ai-localization.ts` (константы 30-37, геттеры 63-85, `localizeWithDeepSeek` 733-790, `rewriteWithDeepSeek` 844-903, `localizeIngestionInput` 1039-1105)
- Test: `tests/ai-localization-provider.test.ts`

- [ ] **Step 1: Тест (падающий)**

`tests/ai-localization-provider.test.ts`:

```ts
import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

import { localizeIngestionInput } from "../lib/ai-localization";

type Seen = { authorization: string; model: string; path: string };

function startFakeCompletions(options: { status?: number; model?: string }) {
  const seen: Seen[] = [];
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(raw) as { model: string };
      seen.push({ authorization: request.headers.authorization || "", model: body.model, path: request.url || "" });
      const status = options.status ?? 200;
      response.writeHead(status, { "Content-Type": "application/json" });
      if (status >= 400) {
        response.end(JSON.stringify({ error: { message: "bridge is down" } }));
        return;
      }
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  headline: "Победа решением судей",
                  body: "Боец выиграл поединок единогласным решением судей на турнире в субботу.",
                  interestScore: 7
                })
              }
            }
          ]
        })
      );
    });
  });
  return new Promise<{ url: string; seen: Seen[]; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        seen,
        close: () => new Promise((done) => server.close(() => done()))
      });
    });
  });
}

const input = {
  headline: "Fighter wins by decision",
  body: "The fighter won the bout by unanimous decision at the event on Saturday night.",
  sourceLabel: "Test Source",
  sourceUrl: "https://example.com/news/1"
};

const envKeys = ["AI_PROVIDER", "CODEX_BRIDGE_URL", "CODEX_BRIDGE_TOKEN", "CODEX_BRIDGE_MODEL", "DEEPSEEK_BASE_URL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

async function withServers(bridgeStatus: number, run: (bridge: Awaited<ReturnType<typeof startFakeCompletions>>, deepseek: Awaited<ReturnType<typeof startFakeCompletions>>) => Promise<void>) {
  const bridge = await startFakeCompletions({ status: bridgeStatus });
  const deepseek = await startFakeCompletions({});
  process.env.CODEX_BRIDGE_URL = bridge.url;
  process.env.CODEX_BRIDGE_TOKEN = "bridge-token";
  process.env.CODEX_BRIDGE_MODEL = "gpt-5.3-codex-spark";
  process.env.DEEPSEEK_BASE_URL = deepseek.url;
  process.env.DEEPSEEK_API_KEY = "deepseek-key";
  process.env.DEEPSEEK_MODEL = "deepseek-chat";
  try {
    await run(bridge, deepseek);
  } finally {
    restoreEnv();
    await bridge.close();
    await deepseek.close();
  }
}

test("AI_PROVIDER=codex sends the request to the bridge with the bridge token and model", async (context) => {
  context.mock.method(console, "error", () => {});
  await withServers(200, async (bridge, deepseek) => {
    process.env.AI_PROVIDER = "codex";
    const result = await localizeIngestionInput(input);
    assert.equal(result.localized, true);
    assert.equal(result.model, "codex:gpt-5.3-codex-spark");
    assert.equal(result.interestScore, 7);
    assert.ok(bridge.seen.length >= 1);
    assert.equal(bridge.seen[0].authorization, "Bearer bridge-token");
    assert.equal(bridge.seen[0].model, "gpt-5.3-codex-spark");
    assert.equal(bridge.seen[0].path, "/v1/chat/completions");
    assert.equal(deepseek.seen.length, 0);
  });
});

test("AI_PROVIDER=codex falls back to DeepSeek when the bridge fails", async (context) => {
  const errors = context.mock.method(console, "error", () => {});
  await withServers(502, async (bridge, deepseek) => {
    process.env.AI_PROVIDER = "codex";
    const result = await localizeIngestionInput(input);
    assert.equal(result.localized, true);
    assert.equal(result.model, "deepseek-chat");
    assert.equal(bridge.seen.length, 1);
    assert.ok(deepseek.seen.length >= 1);
    assert.ok(errors.mock.calls.some((call) => String(call.arguments[0]).includes("codex")));
  });
});

test("AI_PROVIDER=deepseek never touches the bridge even when it is configured", async (context) => {
  context.mock.method(console, "error", () => {});
  await withServers(200, async (bridge, deepseek) => {
    process.env.AI_PROVIDER = "deepseek";
    const result = await localizeIngestionInput(input);
    assert.equal(result.model, "deepseek-chat");
    assert.equal(bridge.seen.length, 0);
    assert.ok(deepseek.seen.length >= 1);
  });
});

test("an explicit provider override is strict: no fallback, error is thrown", async (context) => {
  context.mock.method(console, "error", () => {});
  await withServers(502, async (bridge, deepseek) => {
    process.env.AI_PROVIDER = "deepseek";
    await assert.rejects(() => localizeIngestionInput(input, { provider: "codex" }), /HTTP 502/);
    assert.equal(bridge.seen.length, 1);
    assert.equal(deepseek.seen.length, 0);
  });
});

test("an explicit override to an unconfigured provider throws a clear error", async () => {
  restoreEnv();
  delete process.env.CODEX_BRIDGE_URL;
  delete process.env.CODEX_BRIDGE_TOKEN;
  process.env.CODEX_BRIDGE_URL = "";
  process.env.CODEX_BRIDGE_TOKEN = "";
  try {
    await assert.rejects(() => localizeIngestionInput(input, { provider: "codex" }), /not configured/);
  } finally {
    restoreEnv();
  }
});
```

Примечание к последнему тесту: `getEnvValue` при пустом `process.env` читает `.env` из cwd; в репозитории `.env` не содержит `CODEX_BRIDGE_*`, поэтому пустые строки дают «не настроен». Если у разработчика в `.env` эти ключи есть, тест честно упадёт — это ожидаемо.

- [ ] **Step 2: Запустить тест, убедиться, что падает**

Run: `node --import tsx --test tests/ai-localization-provider.test.ts`
Expected: первый тест падает на `result.model` (`deepseek-chat` вместо `codex:...`) или на `bridge.seen.length`; четвёртый — `TypeError`/нет отклонения, потому что второго аргумента ещё нет.

- [ ] **Step 3: Константы и геттеры**

В `lib/ai-localization.ts` после строки 37 (`const defaultAlibabaModel = ...`) добавить:

```ts
const defaultCodexBridgeModel = "gpt-5.3-codex-spark";

type OpenAiCompatibleProvider = {
  name: "deepseek" | "codex";
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type LocalizationProviderOverride = "deepseek" | "codex";
```

После `getDeepSeekModel()` (строка 73) добавить:

```ts
function getCodexBridgeUrl() {
  return getEnvValue("CODEX_BRIDGE_URL");
}

function getCodexBridgeToken() {
  return getEnvValue("CODEX_BRIDGE_TOKEN");
}

function getCodexBridgeModel() {
  return getEnvValue("CODEX_BRIDGE_MODEL", defaultCodexBridgeModel);
}

function getDeepSeekProvider(): OpenAiCompatibleProvider | null {
  const apiKey = getDeepSeekApiKey();
  if (!apiKey) {
    return null;
  }
  return { name: "deepseek", baseUrl: getDeepSeekBaseUrl(), apiKey, model: getDeepSeekModel() };
}

function getCodexBridgeProvider(): OpenAiCompatibleProvider | null {
  const baseUrl = getCodexBridgeUrl();
  const apiKey = getCodexBridgeToken();
  if (!baseUrl || !apiKey) {
    return null;
  }
  return { name: "codex", baseUrl, apiKey, model: getCodexBridgeModel() };
}

/** Имя модели для записи в результат: у моста с префиксом, чтобы отличать от DeepSeek в отчётах. */
function providerModelLabel(provider: OpenAiCompatibleProvider) {
  return provider.name === "codex" ? `codex:${provider.model}` : provider.model;
}

/**
 * Порядок провайдеров. Явное переопределение — ровно один провайдер без фолбэка
 * (нужно скрипту сравнения). Без него: AI_PROVIDER=codex → мост, затем DeepSeek;
 * AI_PROVIDER=deepseek или пусто → DeepSeek.
 */
function resolveOpenAiCompatibleProviders(override?: LocalizationProviderOverride): OpenAiCompatibleProvider[] {
  const deepSeek = getDeepSeekProvider();
  const codex = getCodexBridgeProvider();

  if (override === "codex") {
    if (!codex) {
      throw new Error("Codex bridge is not configured (CODEX_BRIDGE_URL / CODEX_BRIDGE_TOKEN)");
    }
    return [codex];
  }
  if (override === "deepseek") {
    if (!deepSeek) {
      throw new Error("DeepSeek is not configured (DEEPSEEK_API_KEY)");
    }
    return [deepSeek];
  }

  const provider = getAiProvider();
  const order: OpenAiCompatibleProvider[] = [];
  if (provider === "codex" && codex) {
    order.push(codex);
  }
  if ((provider === "codex" || provider === "deepseek" || !provider) && deepSeek) {
    order.push(deepSeek);
  }
  return order;
}
```

- [ ] **Step 4: Обобщить DeepSeek-ветки**

В `localizeWithDeepSeek` (строка 733) заменить сигнатуру и начало:

```ts
async function localizeWithOpenAiCompatible(
  provider: OpenAiCompatibleProvider,
  input: IngestDraftInput
): Promise<LocalizedIngestionResult> {
  const { apiKey, model, baseUrl } = provider;
  const initialResponse = await sendOpenAiCompatibleJsonPrompt({
```

Убрать строки `const apiKey = getDeepSeekApiKey(); if (!apiKey) { throw ... } const model = getDeepSeekModel(); const baseUrl = getDeepSeekBaseUrl();`. Тело (промпты, проверка на украинский, красные флаги) не менять. В `return` заменить `model,` на `model: providerModelLabel(provider),`.

Точно так же `rewriteWithDeepSeek` (строка 844) → `rewriteWithOpenAiCompatible(provider, input)`: те же замены в начале и `model: providerModelLabel(provider)` в `return`.

- [ ] **Step 5: Переписать `localizeIngestionInput`**

Заменить функцию целиком (строки 1039-1105):

```ts
export async function localizeIngestionInput(
  input: IngestDraftInput,
  options: { provider?: LocalizationProviderOverride } = {}
): Promise<LocalizedIngestionResult> {
  const sourceText = `${input.headline}\n${input.body}`.trim();
  const strict = Boolean(options.provider);
  const unlocalized: LocalizedIngestionResult = {
    headline: input.headline,
    body: input.body,
    localized: false,
    model: null,
    interestScore: null
  };

  if (!sourceText) {
    return unlocalized;
  }

  const providers = resolveOpenAiCompatibleProviders(options.provider);

  if (looksRussian(sourceText) && isPredominantlyRussian(sourceText)) {
    for (const provider of providers) {
      try {
        return await rewriteWithOpenAiCompatible(provider, input);
      } catch (error) {
        if (strict) {
          throw error;
        }
        console.error(`${provider.name} Russian rewrite failed, trying next provider or saving original text`, error);
      }
    }
    return unlocalized;
  }

  for (const provider of providers) {
    try {
      return await localizeWithOpenAiCompatible(provider, input);
    } catch (error) {
      if (strict) {
        throw error;
      }
      console.error(`${provider.name} localization failed, falling back to next provider/OpenAI/source language`, error);
    }
  }

  if (strict) {
    return unlocalized;
  }

  const legacyProvider = getAiProvider();
  if (legacyProvider === "alibaba" && getAlibabaApiKey()) {
    try {
      return await localizeWithAlibaba(input);
    } catch (error) {
      console.error("Alibaba localization failed, falling back to OpenAI/source language", error);
    }
  }

  if (getOpenAiApiKey()) {
    try {
      return await localizeWithOpenAi(input);
    } catch (error) {
      console.error("OpenAI localization failed, saving source language", error);
    }
  }

  return unlocalized;
}
```

Поведение без `AI_PROVIDER=codex` совпадает с прежним: DeepSeek → (alibaba при `AI_PROVIDER=alibaba`) → OpenAI → исходный текст. Вызов `rewriteWithDeepSeek`/`localizeWithDeepSeek` больше нигде не должен остаться: `grep -n "WithDeepSeek" lib/ai-localization.ts` → пусто (кроме, возможно, `generateTelegramDigestForArticle`, который использует `sendOpenAiCompatibleSingleTextPrompt` напрямую и не меняется).

- [ ] **Step 6: Тесты и typecheck**

Run: `node --import tsx --test tests/ai-localization-provider.test.ts`
Expected: 5 passed.

Run: `npm run typecheck`
Expected: без ошибок. (Если ругается на Prisma-типы — сначала `npm run prisma:generate:pg`, не голый `prisma generate`.)

Run: `npm test`
Expected: все тесты зелёные.

- [ ] **Step 7: Commit**

```bash
git add lib/ai-localization.ts tests/ai-localization-provider.test.ts
git commit -m "feat(ai): провайдер codex через мост на VPS с фолбэком на DeepSeek"
```

---

### Task 7: `hasCodexBridge` и `.env.example`

**Files:**
- Modify: `lib/env.ts:60-92`
- Modify: `.env.example`

- [ ] **Step 1: Флаг в отчёте окружения**

В `getEnvironmentReport()` после `const ollamaUrl = ...` добавить:

```ts
  const codexBridgeUrl = readEnv(process.env.CODEX_BRIDGE_URL);
  const codexBridgeToken = readEnv(process.env.CODEX_BRIDGE_TOKEN);
```

В возвращаемый объект после `hasOllama: Boolean(ollamaUrl),`:

```ts
    hasCodexBridge: Boolean(codexBridgeUrl && codexBridgeToken),
```

- [ ] **Step 2: Пример env**

В `.env.example` после блока `DEEPSEEK_*` добавить:

```sh
# Мост к Codex на VPS (см. ops/codex-bridge/README.md). AI_PROVIDER="codex" включает его с фолбэком на DeepSeek.
CODEX_BRIDGE_URL=""
CODEX_BRIDGE_TOKEN=""
CODEX_BRIDGE_MODEL="gpt-5.3-codex-spark"
```

- [ ] **Step 3: Проверка и commit**

Run: `npm run typecheck`
Expected: без ошибок.

```bash
git add lib/env.ts .env.example
git commit -m "chore(env): флаг hasCodexBridge и переменные моста в примере env"
```

---

### Task 8: `--dump` в discovery

**Files:**
- Modify: `scripts/discover-weekly-news.js:107-145` (parseArgs), `:646` (postDraft в processSource), `:666-686` (запись SourceDiscoveryRun), `:752-762` (main)

- [ ] **Step 1: Опция**

В `parseArgs` в объект `options` добавить `dumpFile: ""`, а в цикл перед `if (arg === "--dry-run")`:

```js
    if (arg === "--dump" && argv[index + 1]) {
      options.dumpFile = argv[++index];
      continue;
    }
```

- [ ] **Step 2: Не постить и не писать статистику в режиме dump**

В `processSource` строку `if (!options.dryRun) {` заменить на `if (!options.dryRun && !options.dumpFile) {`. Блок `try { await prisma.sourceDiscoveryRun.create(...) } catch (...) {...}` обернуть: 

```js
  if (!options.dumpFile) {
    try {
      await prisma.sourceDiscoveryRun.create({
        ...
      });
    } catch (error) {
      console.error(`[STATS] failed to record SourceDiscoveryRun for ${source.label}: ${error.message || error}`);
    }
  }
```

- [ ] **Step 3: Запись файла**

В `main` перед `if (options.dryRun) {` добавить (вверху файла есть `require("node:url")`; добавить `const fs = require("node:fs");` рядом с ним):

```js
  if (options.dumpFile) {
    const items = discovered.map((item) => ({
      headline: item.headline,
      body: item.body,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.sourceUrl,
      publishedAt: item.publishedAt,
      category: item.category
    }));
    fs.writeFileSync(options.dumpFile, JSON.stringify(items, null, 2), "utf8");
    console.log(`Dumped ${items.length} items to ${options.dumpFile}`);
    await prisma.$disconnect();
    return;
  }
```

- [ ] **Step 4: Проверка локально на одном источнике**

Run: `node scripts/discover-weekly-news.js --dump "$SCRATCH/items-local.json" --days 3 --limit-per-source 2 --source-label "MMA Fighting"`
Expected: `Dumped N items to ...`, файл — JSON-массив объектов с шестью полями; черновики на localhost не создаются (в выводе нет строк `[INGEST]`). Точное значение `--source-label` взять из `ALL_SOURCES` в файле (`label`). Нужна локальная база (`DATABASE_URL`) — скрипт читает таксономию; если базы нет, проверку сделать на проде в Task 10.

- [ ] **Step 5: Commit**

```bash
git add scripts/discover-weekly-news.js
git commit -m "feat(discovery): флаг --dump для выгрузки найденных материалов в JSON"
```

---

### Task 9: Скрипт сравнения и отчёт

**Files:**
- Create: `scripts/ai-compare-report.ts`
- Create: `scripts/compare-ai-providers.ts`
- Test: `tests/ai-compare-report.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Тест отчёта (падающий)**

`tests/ai-compare-report.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { buildCompareReport, type CompareRow } from "../scripts/ai-compare-report";

const rows: CompareRow[] = [
  {
    index: 1,
    sourceLabel: "MMA Fighting",
    sourceUrl: "https://example.com/1",
    headline: "Fighter wins",
    outcomes: [
      { provider: "codex", ok: true, model: "codex:gpt-5.3-codex-spark", headline: "Боец победил", body: "Текст один.", interestScore: 7, durationMs: 12000, error: null },
      { provider: "deepseek", ok: true, model: "deepseek-chat", headline: "Победа бойца", body: "Текст два, длиннее.", interestScore: 6, durationMs: 8000, error: null }
    ]
  },
  {
    index: 2,
    sourceLabel: "MMA Junkie",
    sourceUrl: "https://example.com/2",
    headline: "Card changes",
    outcomes: [
      { provider: "codex", ok: false, model: null, headline: "", body: "", interestScore: null, durationMs: 3000, error: "HTTP 502: rate limit" },
      { provider: "deepseek", ok: true, model: "deepseek-chat", headline: "Изменения в карде", body: "Текст.", interestScore: 5, durationMs: 4000, error: null }
    ]
  }
];

test("buildCompareReport renders every input with both providers and a summary", () => {
  const report = buildCompareReport(rows, { generatedAt: "2026-09-05T12:00:00.000Z" });
  assert.match(report, /^# Сравнение AI-провайдеров/m);
  assert.match(report, /## 1\. Fighter wins/);
  assert.match(report, /## 2\. Card changes/);
  assert.match(report, /### codex — codex:gpt-5\.3-codex-spark, 12\.0 с, interest 7/);
  assert.match(report, /### deepseek — deepseek-chat, 8\.0 с, interest 6/);
  assert.match(report, /### codex — ошибка, 3\.0 с/);
  assert.match(report, /HTTP 502: rate limit/);
  assert.match(report, /\| codex \| 2 \| 1 \| 7\.5 \| 11 \|/);
  assert.match(report, /\| deepseek \| 2 \| 0 \| 6\.0 \| 13 \|/);
});
```

Как считается сводка: среднее время — по всем запускам провайдера (codex: (12000 + 3000) / 2 = 7.5 с; deepseek: (8000 + 4000) / 2 = 6.0 с); средняя длина текста — только по удачным, округление `Math.round` (codex: «Текст один.» = 11; deepseek: (19 + 6) / 2 = 12.5 → 13).

- [ ] **Step 2: Запустить тест, убедиться, что падает**

Run: `node --import tsx --test tests/ai-compare-report.test.ts`
Expected: `Cannot find module '../scripts/ai-compare-report'`.

- [ ] **Step 3: Сборка отчёта**

`scripts/ai-compare-report.ts`:

```ts
export type CompareOutcome = {
  provider: string;
  ok: boolean;
  model: string | null;
  headline: string;
  body: string;
  interestScore: number | null;
  durationMs: number;
  error: string | null;
};

export type CompareRow = {
  index: number;
  sourceLabel: string;
  sourceUrl: string;
  headline: string;
  outcomes: CompareOutcome[];
};

function seconds(ms: number) {
  return (ms / 1000).toFixed(1);
}

function outcomeHeading(outcome: CompareOutcome) {
  if (!outcome.ok) {
    return `### ${outcome.provider} — ошибка, ${seconds(outcome.durationMs)} с`;
  }
  const interest = outcome.interestScore === null ? "interest —" : `interest ${outcome.interestScore}`;
  return `### ${outcome.provider} — ${outcome.model ?? "?"}, ${seconds(outcome.durationMs)} с, ${interest}`;
}

function summaryTable(rows: CompareRow[]) {
  const providers = new Map<string, { runs: number; errors: number; totalMs: number; totalLength: number; okCount: number }>();
  for (const row of rows) {
    for (const outcome of row.outcomes) {
      const entry = providers.get(outcome.provider) ?? { runs: 0, errors: 0, totalMs: 0, totalLength: 0, okCount: 0 };
      entry.runs += 1;
      entry.totalMs += outcome.durationMs;
      if (outcome.ok) {
        entry.okCount += 1;
        entry.totalLength += outcome.body.length;
      } else {
        entry.errors += 1;
      }
      providers.set(outcome.provider, entry);
    }
  }
  const lines = [
    "| провайдер | запусков | ошибок | среднее время, с | средняя длина текста, символов |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const [provider, entry] of providers) {
    const avgSeconds = entry.runs ? seconds(entry.totalMs / entry.runs) : "—";
    const avgLength = entry.okCount ? String(Math.round(entry.totalLength / entry.okCount)) : "—";
    lines.push(`| ${provider} | ${entry.runs} | ${entry.errors} | ${avgSeconds} | ${avgLength} |`);
  }
  return lines.join("\n");
}

export function buildCompareReport(rows: CompareRow[], options: { generatedAt?: string } = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const parts: string[] = [`# Сравнение AI-провайдеров`, "", `Сформировано: ${generatedAt}. Материалов: ${rows.length}.`, "", "## Сводка", "", summaryTable(rows), ""];

  for (const row of rows) {
    parts.push(`## ${row.index}. ${row.headline}`, "", `Источник: ${row.sourceLabel} — ${row.sourceUrl}`, "");
    for (const outcome of row.outcomes) {
      parts.push(outcomeHeading(outcome), "");
      if (!outcome.ok) {
        parts.push("```", outcome.error ?? "unknown error", "```", "");
        continue;
      }
      parts.push(`**${outcome.headline}**`, "", outcome.body, "");
    }
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Запустить тест**

Run: `node --import tsx --test tests/ai-compare-report.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Скрипт прогона**

`scripts/compare-ai-providers.ts`:

```ts
/**
 * Прогоняет материалы из JSON (см. discover-weekly-news.js --dump) через мост Codex и DeepSeek
 * и пишет markdown-отчёт. Запуск на проде из /opt/fightbase (там .env с ключами и туннель):
 *   npx tsx scripts/compare-ai-providers.ts /tmp/items.json --limit 10 --out /tmp/ai-compare.md
 */
import fs from "node:fs";
import path from "node:path";

import { localizeIngestionInput, type LocalizationProviderOverride } from "../lib/ai-localization";
import { buildCompareReport, type CompareOutcome, type CompareRow } from "./ai-compare-report";

type DumpedItem = {
  headline: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt?: string;
  category?: string;
};

const PROVIDERS: LocalizationProviderOverride[] = ["codex", "deepseek"];

function parseArgs(argv: string[]) {
  const options = { file: "", limit: 10, out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[++index]) || 10;
    } else if (arg === "--out" && argv[index + 1]) {
      options.out = argv[++index];
    } else if (!options.file) {
      options.file = arg;
    }
  }
  if (!options.file) {
    throw new Error("usage: compare-ai-providers.ts <items.json> [--limit N] [--out report.md]");
  }
  if (!options.out) {
    options.out = path.join("ops", "reports", `ai-compare-${new Date().toISOString().slice(0, 10)}.md`);
  }
  return options;
}

async function runProvider(provider: LocalizationProviderOverride, item: DumpedItem): Promise<CompareOutcome> {
  const started = Date.now();
  try {
    const result = await localizeIngestionInput(
      { headline: item.headline, body: item.body, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl },
      { provider }
    );
    return {
      provider,
      ok: result.localized,
      model: result.model,
      headline: result.headline,
      body: result.body,
      interestScore: result.interestScore,
      durationMs: Date.now() - started,
      error: result.localized ? null : "provider returned the source text unchanged"
    };
  } catch (error) {
    return {
      provider,
      ok: false,
      model: null,
      headline: "",
      body: "",
      interestScore: null,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const items = (JSON.parse(fs.readFileSync(options.file, "utf8")) as DumpedItem[]).slice(0, options.limit);
  const rows: CompareRow[] = [];

  for (const [position, item] of items.entries()) {
    const outcomes: CompareOutcome[] = [];
    for (const provider of PROVIDERS) {
      console.log(`[${position + 1}/${items.length}] ${provider}: ${item.headline}`);
      const outcome = await runProvider(provider, item);
      console.log(`  -> ${outcome.ok ? "ok" : "error"} in ${(outcome.durationMs / 1000).toFixed(1)}s${outcome.error ? `: ${outcome.error.slice(0, 160)}` : ""}`);
      outcomes.push(outcome);
    }
    rows.push({ index: position + 1, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, headline: item.headline, outcomes });
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, buildCompareReport(rows), "utf8");
  console.log(`Report written to ${options.out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 6: `.gitignore`**

Добавить строку `ops/reports/` (отчёты содержат тексты статей, в репозиторий не идут).

- [ ] **Step 7: Проверки и commit**

Run: `npm run typecheck` → без ошибок. Run: `npm test` → зелёные.

```bash
git add scripts/ai-compare-report.ts scripts/compare-ai-providers.ts tests/ai-compare-report.test.ts .gitignore
git commit -m "feat(ai): скрипт сравнения провайдеров Codex и DeepSeek с markdown-отчётом"
```

---

### Task 10: Деплой и эксперимент

**Files:** нет.

- [ ] **Step 1: Сборка и смоук локально**

```bash
npm run build && npm run test:smoke
```

Expected: сборка успешна, смоук зелёный (смоук без `build` ничего не подтверждает).

- [ ] **Step 2: Влить в master и задеплоить**

```bash
git switch master && git pull --ff-only origin master
git merge --no-ff feat/codex-bridge -m "Merge feat/codex-bridge: мост к Codex на VPS"
git push origin master
```

Проверить деплой: через 3-5 минут `curl -s -o /dev/null -w "%{http_code}\n" https://fightbase.ru/` → 200, а `ssh root@fightbase.ru 'cd /opt/fightbase && git log --oneline -1'` показывает merge-коммит. Прод после деплоя перезапускается и подхватывает `CODEX_BRIDGE_*` из `.env`; `AI_PROVIDER` по-прежнему `deepseek`.

- [ ] **Step 3: Выгрузить материалы на проде**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'cd /opt/fightbase && sudo -u fightbase bash -c "set -a; . ./.env; set +a; node scripts/discover-weekly-news.js --dump /tmp/items.json --days 3 --limit-per-source 4" 2>&1 | tail -n 5'
```

Expected: `Dumped N items` с N ≥ 10. Если меньше — увеличить `--days` до 7.

- [ ] **Step 4: Прогнать сравнение**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'cd /opt/fightbase && sudo -u fightbase npx tsx scripts/compare-ai-providers.ts /tmp/items.json --limit 10 --out /tmp/ai-compare.md 2>&1 | tail -n 25'
scp -i ~/.ssh/fightbase_deploy root@fightbase.ru:/tmp/ai-compare.md ops/reports/ai-compare-2026-09-05.md
```

Expected: 20 строк `-> ok/error`, отчёт скопирован. Ошибки моста читать в `journalctl -u codex-bridge -n 50` на VPS.

- [ ] **Step 5: Отчёт пользователю**

Отправить `ops/reports/ai-compare-2026-09-05.md` через SendUserFile с двумя-тремя фразами: сколько ошибок у каждого провайдера, среднее время, субъективное впечатление от 2-3 пар. Решение о `AI_PROVIDER=codex` за пользователем.

- [ ] **Step 6: Финальный слепок VPS**

```bash
ssh -i ~/.ssh/fightbase_deploy root@31.59.185.86 'sh -s' < ops/codex-bridge/snapshot.sh > "$SCRATCH/vps-final.txt"
diff "$SCRATCH/vps-before.txt" "$SCRATCH/vps-final.txt"
```

Expected: отличия только `codexbridge`, `127.0.0.1:8787`, `codex-bridge.service`, память/диск.

---

### Task 11 (по решению пользователя): включить провайдер на проде

**Files:** нет.

- [ ] **Step 1: Переключить**

```bash
ssh -i ~/.ssh/fightbase_deploy root@fightbase.ru 'sed -i "s/^AI_PROVIDER=.*/AI_PROVIDER=\"codex\"/" /opt/fightbase/.env && grep ^AI_PROVIDER= /opt/fightbase/.env && systemctl restart fightbase && sleep 5 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/'
```

Expected: `AI_PROVIDER="codex"`, 200.

- [ ] **Step 2: Наблюдение за первым ингестом**

После ближайшего запуска discovery: `journalctl -u fightbase --since "1 hour ago" | grep -iE "codex|deepseek|localization"` — ожидаются записи без `failed`, у новых статей в админке модель `codex:gpt-5.3-codex-spark`.

При «нет» от пользователя: на VPS `systemctl disable --now codex-bridge`, на проде `systemctl disable --now codex-bridge-tunnel`; код и env остаются для будущих моделей.
