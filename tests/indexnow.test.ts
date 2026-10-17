import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildIndexNowPayloads, INDEXNOW_KEY, isIndexNowEnabled, resolveIndexNowSince } from "../lib/indexnow";

test("IndexNow payload keeps own-host urls once and points to the key file", () => {
  const [payload, ...rest] = buildIndexNowPayloads("https://fightbase.ru", [
    "https://fightbase.ru/ru/predictions/a/b",
    "https://fightbase.ru/ru/predictions/a/b",
    "https://example.com/ru/news/x",
    "not a url"
  ]);
  assert.equal(rest.length, 0);
  assert.deepEqual(payload, {
    host: "fightbase.ru",
    key: INDEXNOW_KEY,
    keyLocation: `https://fightbase.ru/${INDEXNOW_KEY}.txt`,
    urlList: ["https://fightbase.ru/ru/predictions/a/b"]
  });
  assert.deepEqual(buildIndexNowPayloads("https://fightbase.ru", []), []);
});

test("IndexNow payloads are split by the 10 000 url limit", () => {
  const urls = Array.from({ length: 10_001 }, (_, index) => `https://fightbase.ru/ru/news/${index}`);
  assert.deepEqual(
    buildIndexNowPayloads("https://fightbase.ru", urls).map((payload) => payload.urlList.length),
    [10_000, 1]
  );
});

test("IndexNow is sent only from the production https host", () => {
  assert.equal(isIndexNowEnabled("https://fightbase.ru"), true);
  assert.equal(isIndexNowEnabled("http://localhost:3000"), false);
  assert.equal(isIndexNowEnabled("https://app.localhost"), false);
});

test("IndexNow since falls back to two hours and is clamped to a week", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  assert.equal(resolveIndexNowSince(undefined, now).toISOString(), "2026-10-17T10:00:00.000Z");
  assert.equal(resolveIndexNowSince("garbage", now).toISOString(), "2026-10-17T10:00:00.000Z");
  assert.equal(resolveIndexNowSince("2026-10-18T00:00:00Z", now).toISOString(), "2026-10-17T10:00:00.000Z");
  assert.equal(resolveIndexNowSince("2026-10-17T11:00:00Z", now).toISOString(), "2026-10-17T11:00:00.000Z");
  assert.equal(resolveIndexNowSince("2026-09-01T00:00:00Z", now).toISOString(), "2026-10-10T12:00:00.000Z");
});

test("the IndexNow key file in public/ holds the key", async () => {
  const contents = await readFile(path.resolve(process.cwd(), "public", `${INDEXNOW_KEY}.txt`), "utf8");
  assert.equal(contents.trim(), INDEXNOW_KEY);
});
