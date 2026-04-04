import test from "node:test";
import assert from "node:assert/strict";

import { checkRateLimit } from "../lib/rate-limit";

test("rate limiter allows up to limit and then blocks", () => {
  const scope = `test-scope-${Date.now()}`;
  const key = "127.0.0.1";

  const first = checkRateLimit(scope, key, 2, 60_000);
  const second = checkRateLimit(scope, key, 2, 60_000);
  const third = checkRateLimit(scope, key, 2, 60_000);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.ok(third.resetAt >= first.resetAt);
});
