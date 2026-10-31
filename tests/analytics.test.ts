import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignUrl } from "../lib/campaign-url";
import { METRIKA_ID, resolveMetrikaId } from "../lib/metrika-config";
import { reachMetrikaGoal } from "../lib/metrika";

test("counter configuration accepts an override and rejects invalid script input", () => {
  assert.equal(resolveMetrikaId(undefined), 108511042);
  assert.equal(resolveMetrikaId(" 123456 "), 123456);
  for (const value of [" ", "0", "-1", "1.5", "NaN", "1);alert(1)", "9007199254740992"]) {
    assert.equal(resolveMetrikaId(value), null);
  }
});

test("goals tolerate SSR and blocked analytics and use the configured counter", () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    assert.doesNotThrow(() => reachMetrikaGoal("social_telegram_click"));
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    assert.doesNotThrow(() => reachMetrikaGoal("social_telegram_click"));
    const calls: unknown[][] = [];
    Object.defineProperty(globalThis, "window", { value: { ym: (...args: unknown[]) => calls.push(args) }, configurable: true });
    reachMetrikaGoal("prediction_telegram_click");
    assert.deepEqual(calls, METRIKA_ID ? [[METRIKA_ID, "reachGoal", "prediction_telegram_click"]] : []);
  } finally {
    if (old) Object.defineProperty(globalThis, "window", old);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("campaign links preserve destination, query and fragment without duplicate tags", () => {
  const original = "https://fightbase.ru/ru/events/example?lang=ru&utm_source=old#card";
  const tagged = buildCampaignUrl(original, "telegram", "event_picks");
  const url = new URL(tagged);
  assert.equal(url.pathname, "/ru/events/example");
  assert.equal(url.hash, "#card");
  assert.equal(url.searchParams.get("lang"), "ru");
  assert.deepEqual(url.searchParams.getAll("utm_source"), ["telegram"]);
  assert.equal(url.searchParams.get("utm_medium"), "social");
  assert.equal(url.searchParams.get("utm_campaign"), "event_picks");
  assert.equal(buildCampaignUrl(tagged, "telegram", "event_picks"), tagged);
});
