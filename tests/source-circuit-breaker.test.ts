import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createSourceCircuitBreaker } = createRequire(import.meta.url)("../scripts/source-circuit-breaker.js");
test("repeated failures stop one source while other hosts remain usable", () => {
  const circuit = createSourceCircuitBreaker();
  for (let n = 0; n < 3; n++) circuit.failed("down.example");
  assert.equal(circuit.isOpen("down.example"), true);
  assert.equal(circuit.isOpen("healthy.example"), false);
  assert.equal(createSourceCircuitBreaker().isOpen("down.example"), false);
});
test("a successful page resets consecutive failures", () => {
  const circuit = createSourceCircuitBreaker();
  circuit.failed("example"); circuit.failed("example"); circuit.succeeded("example"); circuit.failed("example");
  assert.equal(circuit.isOpen("example"), false);
});
