import test from "node:test";
import assert from "node:assert/strict";

import { isNavigationItemActive } from "../lib/navigation";

test("marks exact and nested localized navigation routes as active", () => {
  assert.equal(isNavigationItemActive("/ru/events", "/ru/events"), true);
  assert.equal(isNavigationItemActive("/ru/events/ufc-329", "/ru/events"), true);
  assert.equal(isNavigationItemActive("/predictions/event/fight", "/ru/predictions"), true);
});

test("does not use a partial route segment as an active match", () => {
  assert.equal(isNavigationItemActive("/ru/newsroom", "/ru/news"), false);
  assert.equal(isNavigationItemActive("/ru/analysis", "/ru/news"), false);
});

test("only marks the home item active on the locale root", () => {
  assert.equal(isNavigationItemActive("/ru", "/ru"), true);
  assert.equal(isNavigationItemActive("/ru/news", "/ru"), false);
});
