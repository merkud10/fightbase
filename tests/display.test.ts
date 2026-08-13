import assert from "node:assert/strict";
import test from "node:test";

import { formatEventLocation } from "../lib/display";

test("formatEventLocation hides TBD placeholders entirely", () => {
  assert.equal(formatEventLocation("TBD", "TBD", "ru"), "");
  assert.equal(formatEventLocation("TBD", null, "ru"), "");
  assert.equal(formatEventLocation(null, "TBD", "ru"), "");
});

test("formatEventLocation keeps real venues and cities", () => {
  assert.equal(formatEventLocation("", "Xfinity Mobile Arena, Philadelphia, United States", "en"), "Philadelphia, United States · Xfinity Mobile Arena");
  assert.equal(formatEventLocation("TBD", "UFC APEX", "en"), "UFC APEX");
});
