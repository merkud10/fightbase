import assert from "node:assert/strict";
import test from "node:test";

const {
  buildPhotoSourceUrls,
  buildSearchUrl,
  parseFighterPage,
  parseSearchResults,
  pickSearchCandidate,
  verifyFighterPage
} = require("../scripts/sherdog-utils.js");

// Фрагменты реальной разметки Sherdog (fightfinder и страница бойца), 06.09.2026.
const SEARCH_HTML = `
<table>
<tr><td class="col_five">Association</td></tr>
<tr onclick="document.location='/fighter/Arlind-Berisha-348399';">
  <td width="60"><img class="lazy" src="/image_crop/100/100/_images/fighter_small_default.jpg" data-original="/image_crop/100/100/_images/fighter/1746294719300_1746294710arlindberisha.jpg" width='44'/></td>
  <td><a href="/fighter/Arlind-Berisha-348399">Arlind Berisha</a></td>
  <td></td>
  <td><strong>6'6"</strong><br />(1.98 m)</td>
  <td><strong>205 lbs</strong><br />(92.99 kg)</td>
  <td>Sarpsborg Chi MMA &amp; Kickboxing</td>
</tr>
<tr onclick="document.location='/fighter/Arlind-Berisha-999999';">
  <td width="60"><img class="lazy" src="/image_crop/100/100/_images/fighter_small_default.jpg" width='44'/></td>
  <td><a href="/fighter/Arlind-Berisha-999999">Arlind Berisha</a></td>
  <td></td>
  <td><strong>5'8"</strong><br />(1.73 m)</td>
  <td><strong>155 lbs</strong><br />(70.31 kg)</td>
  <td></td>
</tr>
</table>`;

const PAGE_HTML = `
<h1 itemprop="name"><span class="fn">Colton Loud</span></h1>
<img itemprop="image" src="/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG" class="profile-image photo" alt="Colton Loud" />
<tr><td>HEIGHT</td><td><b itemprop="height">5'10"</b> <em>/</em> 177.8 cm</td></tr>
<div class="winloses win">
    <span>Wins</span>
    <span>7</span>
</div>
<div class="winloses lose">
    <span>Losses</span>
    <span>1</span>
</div>`;

test("parseSearchResults reads name, path and height of every result row", () => {
  assert.deepEqual(parseSearchResults(SEARCH_HTML), [
    { name: "Arlind Berisha", path: "/fighter/Arlind-Berisha-348399", heightCm: 198 },
    { name: "Arlind Berisha", path: "/fighter/Arlind-Berisha-999999", heightCm: 173 }
  ]);
});

test("parseFighterPage reads name, photo, record and height", () => {
  assert.deepEqual(parseFighterPage(PAGE_HTML), {
    name: "Colton Loud",
    photoPath: "/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG",
    wins: 7,
    losses: 1,
    heightCm: 178
  });
});

test("parseFighterPage tolerates a page without record or photo", () => {
  assert.deepEqual(parseFighterPage('<span class="fn">Nobody Here</span>'), {
    name: "Nobody Here",
    photoPath: null,
    wins: null,
    losses: null,
    heightCm: null
  });
});

test("pickSearchCandidate takes the only exact name match", () => {
  const rows = parseSearchResults(SEARCH_HTML).slice(0, 1);
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: null }, rows), { row: rows[0] });
});

test("pickSearchCandidate matches names ignoring diacritics and case", () => {
  const rows = [{ name: "José Aldo", path: "/fighter/Jose-Aldo-11506", heightCm: 170 }];
  assert.deepEqual(pickSearchCandidate({ name: "jose aldo" }, rows), { row: rows[0] });
});

test("pickSearchCandidate and verifyFighterPage accept the same tokens in another order", () => {
  // ESPN: «Kwon Won Il», Sherdog: «Won Il Kwon» — корейский порядок имени.
  const rows = [{ name: "Won Il Kwon", path: "/fighter/Won-Il-Kwon-161997", heightCm: 178 }];
  assert.deepEqual(pickSearchCandidate({ name: "Kwon Won Il" }, rows), { row: rows[0] });
  assert.equal(
    verifyFighterPage(
      { name: "Kwon Won Il", record: "14-6-0" },
      { name: "Won Il Kwon", photoPath: "/image_crop/200/300/_images/fighter/kwon.jpg", wins: 14, losses: 6, heightCm: 178 }
    ),
    null
  );
  // Но частичное совпадение токенов — другой человек.
  assert.deepEqual(pickSearchCandidate({ name: "Reginaldo Junior" }, [{ name: "Reginaldo Geraldo Jr.", path: "/fighter/x", heightCm: 178 }]), {
    reason: "unmatched"
  });
});

test("pickSearchCandidate reports unmatched when no row has the same name", () => {
  const rows = parseSearchResults(SEARCH_HTML);
  assert.deepEqual(pickSearchCandidate({ name: "Reginaldo Junior" }, rows), { reason: "unmatched" });
});

test("pickSearchCandidate disambiguates namesakes by height within 3 cm", () => {
  const rows = parseSearchResults(SEARCH_HTML);
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: 196 }, rows), { row: rows[0] });
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: 185 }, rows), {
    reason: "ambiguous",
    candidates: 2
  });
  assert.deepEqual(pickSearchCandidate({ name: "Arlind Berisha", heightCm: null }, rows), {
    reason: "ambiguous",
    candidates: 2
  });
});

test("verifyFighterPage accepts a matching page", () => {
  const page = parseFighterPage(PAGE_HTML);
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: "7-1-0" }, page), null);
  // ESPN и Sherdog расходятся на один бой — это нормально.
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: "8-1-0" }, page), null);
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: null }, page), null);
});

test("verifyFighterPage rejects another person, a placeholder photo and a different record", () => {
  const page = parseFighterPage(PAGE_HTML);
  assert.equal(verifyFighterPage({ name: "Colton Proud", record: "7-1-0" }, page), "name mismatch");
  assert.equal(
    verifyFighterPage({ name: "Colton Loud", record: "12-2-0" }, page),
    "record mismatch (ours 12-2-0, sherdog 7-1)"
  );
  assert.equal(
    verifyFighterPage(
      { name: "Colton Loud", record: "7-1-0" },
      { ...page, photoPath: "/image_crop/200/300/_images/fighter_default.jpg" }
    ),
    "no photo"
  );
  assert.equal(verifyFighterPage({ name: "Colton Loud", record: "7-1-0" }, { ...page, photoPath: null }), "no photo");
});

test("buildPhotoSourceUrls prefers the CDN original and falls back to the crop", () => {
  assert.deepEqual(buildPhotoSourceUrls("/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG"), [
    "https://www1-cdn.sherdog.com/_images/fighter/20260315110638_Colton_Loud.JPG",
    "https://www.sherdog.com/image_crop/200/300/_images/fighter/20260315110638_Colton_Loud.JPG"
  ]);
  assert.deepEqual(buildPhotoSourceUrls(null), []);
});

test("buildSearchUrl encodes the fighter name", () => {
  assert.equal(buildSearchUrl("José Aldo"), "https://www.sherdog.com/stats/fightfinder?SearchTxt=Jos%C3%A9%20Aldo");
});
