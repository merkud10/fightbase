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
# Байты и явный перевод строки: на Windows текстовый stdin/файл иначе удваивает \r\n.
prompt = sys.stdin.buffer.read().decode("utf-8").replace("\r\n", "\n")
prompt_file = os.environ.get("FAKE_CODEX_PROMPT_FILE")
if prompt_file:
    with open(prompt_file, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(prompt)

mode = os.environ.get("FAKE_CODEX_MODE", "ok")
if mode == "fail":
    sys.stderr.write("boom: rate limit reached\n")
    sys.exit(1)
if mode == "slow":
    time.sleep(float(os.environ.get("FAKE_CODEX_SLEEP", "1.5")))

with open(out_path, "w", encoding="utf-8") as handle:
    handle.write(os.environ.get("FAKE_CODEX_ANSWER", "hello"))
