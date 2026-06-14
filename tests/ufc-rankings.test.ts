import test from "node:test";
import assert from "node:assert/strict";

import { fetchUfcOfficialRankings } from "../lib/ufc-rankings";

const realFetch = globalThis.fetch;

function mockFetch(impl: () => Promise<Response>) {
  globalThis.fetch = (async () => impl()) as typeof fetch;
}

test("fetchUfcOfficialRankings returns [] on a non-OK upstream response (no throw)", async () => {
  mockFetch(async () => new Response("blocked", { status: 403 }));
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.deepEqual(groups, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchUfcOfficialRankings returns [] when the upstream fetch rejects (network/timeout)", async () => {
  mockFetch(async () => {
    throw new Error("network down");
  });
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.deepEqual(groups, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("fetchUfcOfficialRankings parses divisional groups on an OK response", async () => {
  const html = `
    <div class="view-grouping-header">Flyweight Top Rank</div>
    <div class="view-grouping-content"><table class="cols-0">
      <caption><h5><a href="/athlete/champ-guy">Champ Guy</a></h5></caption>
      <img src="https://img.example/champ.png" />
      <tbody>
        <tr>
          <td class="views-field views-field-weight-class-rank">1</td>
          <td class="views-field views-field-name"><a href="/athlete/contender-one">Contender One</a></td>
          <td class="views-field views-field-weight-class-rank-change">&mdash;</td>
        </tr>
        <tr>
          <td class="views-field views-field-weight-class-rank">2</td>
          <td class="views-field views-field-name"><a href="/athlete/contender-two">Contender Two</a></td>
          <td class="views-field views-field-weight-class-rank-change"></td>
        </tr>
      </tbody>
    </table></div>`;
  mockFetch(async () => new Response(html, { status: 200 }));
  try {
    const groups = await fetchUfcOfficialRankings();
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.title, "Flyweight");
    assert.equal(groups[0]?.champion.name, "Champ Guy");
    assert.equal(groups[0]?.rows.length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});
