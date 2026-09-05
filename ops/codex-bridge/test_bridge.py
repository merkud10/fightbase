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
