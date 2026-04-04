import test from "node:test";
import assert from "node:assert/strict";

import {
  adminSessionLifetimeSeconds,
  createAdminSessionToken,
  verifyAdminSessionToken
} from "../lib/auth/session";

test("admin session token roundtrip succeeds", async () => {
  const token = await createAdminSessionToken(
    {
      sub: "editor@example.com",
      email: "editor@example.com",
      role: "admin"
    },
    "test-secret"
  );

  const session = await verifyAdminSessionToken(token, "test-secret");

  assert.ok(session);
  assert.equal(session?.email, "editor@example.com");
  assert.equal(session?.role, "admin");
  assert.ok((session?.exp ?? 0) > Math.floor(Date.now() / 1000));
});

test("admin session token rejects tampering and expiry", async () => {
  const token = await createAdminSessionToken(
    {
      sub: "editor@example.com",
      email: "editor@example.com",
      role: "admin"
    },
    "test-secret",
    1
  );

  const tampered = `${token.slice(0, -1)}x`;

  assert.equal(await verifyAdminSessionToken(tampered, "test-secret"), null);

  const expiredToken = await createAdminSessionToken(
    {
      sub: "editor@example.com",
      email: "editor@example.com",
      role: "admin"
    },
    "test-secret",
    -adminSessionLifetimeSeconds
  );

  assert.equal(await verifyAdminSessionToken(expiredToken, "test-secret"), null);
});
