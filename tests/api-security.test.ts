import test from "node:test";
import assert from "node:assert/strict";

import { authorizeRequest } from "../lib/api-security";

test("authorizeRequest accepts internal token", async () => {
  process.env.INTERNAL_API_SECRET = "internal-secret";

  const request = new Request("http://localhost:3000/api/cron/ingest", {
    method: "POST",
    headers: {
      "x-internal-api-secret": "internal-secret"
    }
  });

  const result = await authorizeRequest(request, {
    allowInternalToken: true
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.kind, "internal");
  }
});

test("authorizeRequest rejects missing auth", async () => {
  delete process.env.INTERNAL_API_SECRET;

  const request = new Request("http://localhost:3000/api/ingest/draft", {
    method: "POST"
  });

  const result = await authorizeRequest(request, {
    allowInternalToken: true
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 401);
  }
});

test("authorizeRequest rate limits repeated requests", async () => {
  const scope = `api-security-${Date.now()}`;
  const firstRequest = new Request("http://localhost:3000/api/push/subscribe", {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.10"
    }
  });
  const secondRequest = new Request("http://localhost:3000/api/push/subscribe", {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.10"
    }
  });

  const first = await authorizeRequest(firstRequest, {
    rateLimit: {
      scope,
      limit: 1,
      windowMs: 60_000
    }
  });
  const second = await authorizeRequest(secondRequest, {
    rateLimit: {
      scope,
      limit: 1,
      windowMs: 60_000
    }
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.response.status, 429);
  }
});
