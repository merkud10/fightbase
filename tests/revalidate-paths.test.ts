import assert from "node:assert/strict";
import test from "node:test";

import { filterRevalidatePaths } from "../lib/revalidate-paths";

test("filterRevalidatePaths keeps only allowed public paths and patterns", () => {
  const result = filterRevalidatePaths([
    "/events/ufc-330-makhachev-vs-machado-garry",
    "/predictions",
    "/predictions/[eventSlug]/[fightSlug]",
    "/events/[slug]",
    "/admin",
    "/api/health",
    "https://evil.example/x",
    "/fighters/islam-makhachev",
    "not-a-path",
    ""
  ]);

  assert.deepEqual(result, [
    { path: "/events/ufc-330-makhachev-vs-machado-garry", type: null },
    { path: "/predictions", type: null },
    { path: "/predictions/[eventSlug]/[fightSlug]", type: "page" },
    { path: "/events/[slug]", type: "page" },
    { path: "/fighters/islam-makhachev", type: null }
  ]);
});

test("filterRevalidatePaths caps the list length", () => {
  const many = Array.from({ length: 60 }, (_, index) => `/events/event-${index}`);
  assert.equal(filterRevalidatePaths(many).length, 50);
});
