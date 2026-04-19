import test from "node:test";
import assert from "node:assert/strict";

import { resolveCronIngestJob } from "../lib/cron-ingest";

test("resolveCronIngestJob keeps sync-odds as sync-odds", () => {
  assert.equal(resolveCronIngestJob("sync-odds"), "sync-odds");
});

test("resolveCronIngestJob maps ai-discovery to weekly-news", () => {
  assert.equal(resolveCronIngestJob("ai-discovery"), "weekly-news");
});

test("resolveCronIngestJob rejects missing job", () => {
  assert.throws(() => resolveCronIngestJob(undefined), /job is required/i);
});
