import test from "node:test";
import assert from "node:assert/strict";
import { ingestionStatus, unresolvedFailures } from "../lib/operational-status";

const now = new Date("2026-09-26T10:00:00Z");
const success = { status: "succeeded", startedAt: new Date("2026-09-26T06:00:00Z"), finishedAt: new Date("2026-09-26T06:03:00Z") };
const base = { latestJob: success, successfulJob: success, latestLegacy: null, successfulLegacy: null, now };

test("queue success replaces the obsolete legacy ingestion freshness signal", () => {
  const result = ingestionStatus(base);
  assert.equal(result.status, "ok");
  assert.equal(result.source, "background-jobs");
  assert.equal(result.lastSucceededAt, success.finishedAt);
});
test("a new failed job stays an error even when earlier success is fresh", () => {
  assert.equal(ingestionStatus({ ...base, latestJob: { ...success, status: "failed" } }).status, "error");
});
test("starting a new job cannot hide twelve hours without a successful completion", () => {
  assert.equal(ingestionStatus({ ...base, latestJob: { ...success, status: "running", finishedAt: null }, successfulJob: { ...success, finishedAt: new Date("2026-09-25T18:00:00Z") } }).status, "warn");
});
test("legacy installations retain freshness checks based on successful completion", () => {
  assert.equal(ingestionStatus({ ...base, latestJob: null, successfulJob: null, latestLegacy: { ...success, status: "success" }, successfulLegacy: success }).status, "ok");
  assert.equal(ingestionStatus({ ...base, latestJob: null, successfulJob: null }).status, "warn");
});
test("only a later success of the same type resolves a failed job", () => {
  const failed = [{ type: "weekly-news", updatedAt: now }, { type: "operational-alerts", updatedAt: now }];
  assert.deepEqual(unresolvedFailures(failed, [{ type: "weekly-news", finishedAt: new Date(now.getTime() + 1) }]), [failed[1]]);
  assert.deepEqual(unresolvedFailures(failed, [{ type: "weekly-news", finishedAt: new Date(now.getTime() - 1) }]), failed);
});
