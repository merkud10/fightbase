import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const CRON_TASKS_PATH = path.resolve(process.cwd(), "scripts", "cron-tasks.sh");

test("cron-tasks.sh has no ${var:-{...}} default-value traps", async () => {
  // Bash ${var:-default} does not honor nested braces: "${2:-{}}" is parsed
  // as "${2:-{}" followed by a literal "}", so a non-empty $2 gets a stray
  // "}" appended. This produced malformed JSON on every cron sync call and
  // caused HTTP 400 from /api/cron/ingest. Guard against the exact pattern.
  const source = await readFile(CRON_TASKS_PATH, "utf8");
  const offenders = source
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => {
      const code = line.replace(/#.*$/, "");
      return /\$\{[^{}]*:-\{/.test(code);
    });

  assert.deepEqual(
    offenders,
    [],
    `Found \${var:-{...}} pattern — use an explicit if-branch instead:\n${offenders
      .map(({ number, line }) => `  ${CRON_TASKS_PATH}:${number}: ${line.trim()}`)
      .join("\n")}`
  );
});

test("cron-tasks.sh passes bash -n syntax check", async () => {
  await assert.doesNotReject(
    execFileAsync("bash", ["-n", CRON_TASKS_PATH]),
    "bash -n reported a syntax error in cron-tasks.sh"
  );
});

test("cron-tasks.sh failure branches surface curl diagnostics, not 'ошибка при запуске'", async () => {
  // Earlier the FAILED branches sent a static 'ошибка при запуске' to Telegram,
  // which hid the actual cause (curl exit / HTTP code). Every POST-style
  // failure branch should now route through describe_curl_failure so the alert
  // carries the real reason.
  const source = await readFile(CRON_TASKS_PATH, "utf8");
  assert.doesNotMatch(
    source,
    /ошибка при запуске/,
    "Replace 'ошибка при запуске' with describe_curl_failure output in the FAILED branch."
  );
});
