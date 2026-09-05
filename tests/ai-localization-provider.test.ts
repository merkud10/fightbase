import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

import { localizeIngestionInput } from "../lib/ai-localization";

type Seen = { authorization: string; model: string; path: string };

function startFakeCompletions(options: { status?: number }) {
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

const envKeys = [
  "AI_PROVIDER",
  "CODEX_BRIDGE_URL",
  "CODEX_BRIDGE_TOKEN",
  "CODEX_BRIDGE_MODEL",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL"
];
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

type FakeServer = Awaited<ReturnType<typeof startFakeCompletions>>;

async function withServers(bridgeStatus: number, run: (bridge: FakeServer, deepseek: FakeServer) => Promise<void>) {
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
    const first = bridge.seen[0];
    assert.ok(first, "bridge received no request");
    assert.equal(first.authorization, "Bearer bridge-token");
    assert.equal(first.model, "gpt-5.3-codex-spark");
    // sendOpenAiCompatibleJsonPrompt добавляет к baseUrl именно /chat/completions (как у DeepSeek без /v1);
    // мост принимает и этот путь, и /v1/chat/completions.
    assert.equal(first.path, "/chat/completions");
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
  process.env.CODEX_BRIDGE_URL = "";
  process.env.CODEX_BRIDGE_TOKEN = "";
  try {
    await assert.rejects(() => localizeIngestionInput(input, { provider: "codex" }), /not configured/);
  } finally {
    restoreEnv();
  }
});
