import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_SITE_URL, resolveSiteUrl } from "../lib/site";

test("production metadata never falls back to localhost or insecure origins", () => {
  assert.equal(resolveSiteUrl(undefined, true).toString(), `${PRODUCTION_SITE_URL}/`);
  assert.equal(resolveSiteUrl("not-a-url", true).toString(), `${PRODUCTION_SITE_URL}/`);
  assert.equal(resolveSiteUrl("http://localhost:3000", true).toString(), `${PRODUCTION_SITE_URL}/`);
  assert.equal(resolveSiteUrl("http://example.com", true).toString(), `${PRODUCTION_SITE_URL}/`);
});

test("valid HTTPS production origins are normalized to their origin", () => {
  assert.equal(resolveSiteUrl("https://preview.example.com/some/path", true).toString(), "https://preview.example.com/");
});

test("local development keeps an explicit local origin", () => {
  assert.equal(resolveSiteUrl(undefined, false).toString(), "http://localhost:3000/");
  assert.equal(resolveSiteUrl("http://127.0.0.1:3100/path", false).toString(), "http://127.0.0.1:3100/");
});
