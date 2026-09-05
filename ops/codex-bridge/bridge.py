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
