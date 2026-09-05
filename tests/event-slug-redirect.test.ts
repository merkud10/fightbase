import test from "node:test";
import assert from "node:assert/strict";

import { eventSlugPrefixCandidates, pickFightSlugByTokens } from "../lib/event-slug-redirect";

test("eventSlugPrefixCandidates: numbered event keeps its number as a prefix", () => {
  assert.deepEqual(eventSlugPrefixCandidates("ufc-330"), ["ufc-330-"]);
  // Переименованный главный бой: старый слаг с суффиксом и общий номер турнира.
  assert.deepEqual(eventSlugPrefixCandidates("ufc-333-volkanovski-vs-evloev"), ["ufc-333-volkanovski-vs-evloev-", "ufc-333-"]);
});

test("eventSlugPrefixCandidates: fight nights only match their own extension", () => {
  assert.deepEqual(eventSlugPrefixCandidates("ufc-fight-night-kape-vs-horiguchi"), ["ufc-fight-night-kape-vs-horiguchi-"]);
  assert.deepEqual(eventSlugPrefixCandidates(""), []);
});

test("pickFightSlugByTokens finds the renamed fight by shared name tokens", () => {
  const candidates = [
    "michael-page-vs-nursulton-ruziboev",
    "fares-ziam-vs-axel-sola",
    "dan-hooker-vs-salahdine-parnasse"
  ];
  assert.equal(pickFightSlugByTokens("michael-venom-page-vs-nursulton-ruziboev", candidates), "michael-page-vs-nursulton-ruziboev");
  assert.equal(pickFightSlugByTokens("sim-kai-xiong-vs-julia-polastri", ["jingnan-xiong-vs-julia-polastri", "talita-alencar-vs-julia-polastri"]), "jingnan-xiong-vs-julia-polastri");
});

test("pickFightSlugByTokens refuses weak or ambiguous matches", () => {
  // Совпадает только «vs» и один токен — недостаточно.
  assert.equal(pickFightSlugByTokens("charles-johnson-vs-jose-ochoa", ["dan-hooker-vs-salahdine-parnasse", "fares-ziam-vs-jose-lima"]), null);
  // Две кандидатуры с одинаковым счётом — не угадываем.
  assert.equal(pickFightSlugByTokens("julia-polastri-vs-a-b", ["julia-polastri-vs-x-y", "julia-polastri-vs-z-w"]), null);
  assert.equal(pickFightSlugByTokens("dan-hooker-vs-salahdine-parnasse", ["dan-hooker-vs-salahdine-parnasse"]), "dan-hooker-vs-salahdine-parnasse");
});
