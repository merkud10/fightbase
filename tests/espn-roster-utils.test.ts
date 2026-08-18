import assert from "node:assert/strict";
import test from "node:test";

const {
  parseEspnHeightCm,
  parseEspnReachCm,
  extractEspnAthleteProfile,
  collectScoreboardCompetitors
} = require("../scripts/espn-roster-utils.js");

test("parseEspnHeightCm converts feet and inches", () => {
  assert.equal(parseEspnHeightCm(`5' 9"`), 175);
  assert.equal(parseEspnHeightCm(`6' 0"`), 183);
  assert.equal(parseEspnHeightCm(""), 0);
  assert.equal(parseEspnHeightCm(null), 0);
});

test("parseEspnReachCm converts inches", () => {
  assert.equal(parseEspnReachCm(`74"`), 188);
  assert.equal(parseEspnReachCm(`70.5"`), 179);
  assert.equal(parseEspnReachCm(undefined), 0);
});

test("extractEspnAthleteProfile maps the athlete payload", () => {
  const profile = extractEspnAthleteProfile({
    athlete: {
      id: 3970873,
      displayName: "Jeremiah Wells",
      age: 39,
      displayHeight: `5' 9"`,
      displayReach: `74"`,
      stance: { text: "Switch" },
      displayFightingStyle: "Brazilian Jiu-Jitsu",
      association: { name: "Renzo Gracie Philly" },
      citizenship: "USA",
      weightClass: { text: "Welterweight" },
      active: true,
      headshot: { href: "https://a.espncdn.com/i/headshots/mma/players/full/3970873.png" },
      statsSummary: {
        statistics: [
          { type: "wins-losses-draws", displayValue: "14-4-1" },
          { type: "tkos-tkolosses", displayValue: "5-0" },
          { type: "submissions-submissionLosses", displayValue: "6-1" }
        ]
      }
    }
  });

  assert.equal(profile.espnId, "3970873");
  assert.equal(profile.record, "14-4-1");
  assert.equal(profile.koWins, 5);
  assert.equal(profile.subWins, 6);
  assert.equal(profile.age, 39);
  assert.equal(profile.heightCm, 175);
  assert.equal(profile.reachCm, 188);
  assert.equal(profile.team, "Renzo Gracie Philly");
  assert.equal(profile.style, "Brazilian Jiu-Jitsu");
  assert.equal(profile.country, "USA");
  assert.equal(profile.weightClass, "Welterweight");
  assert.equal(profile.active, true);
  assert.ok(profile.photoUrl?.includes("3970873.png"));
});

test("extractEspnAthleteProfile returns nulls for missing data instead of fake zeros", () => {
  const profile = extractEspnAthleteProfile({ athlete: { id: 1, displayName: "Somebody" } });

  assert.equal(profile.record, null);
  assert.equal(profile.age, null);
  assert.equal(profile.heightCm, null);
  assert.equal(profile.reachCm, null);
  assert.equal(profile.team, null);
  assert.equal(profile.style, null);
  assert.equal(profile.photoUrl, null);
});

test("extractEspnAthleteProfile rejects a malformed record", () => {
  const profile = extractEspnAthleteProfile({
    athlete: {
      id: 1,
      statsSummary: { statistics: [{ type: "wins-losses-draws", displayValue: "N/A" }] }
    }
  });

  assert.equal(profile.record, null);
});

test("collectScoreboardCompetitors dedupes athletes across fights", () => {
  const competitors = collectScoreboardCompetitors({
    events: [
      {
        competitions: [
          {
            competitors: [
              { id: 1, athlete: { fullName: "Fighter One" } },
              { id: 2, athlete: { fullName: "Fighter Two" } }
            ]
          },
          {
            competitors: [
              { id: 1, athlete: { fullName: "Fighter One" } },
              { id: 3, athlete: { fullName: "Fighter Three" } }
            ]
          }
        ]
      }
    ]
  });

  assert.deepEqual(
    competitors.map((competitor: { espnId: string }) => competitor.espnId),
    ["1", "2", "3"]
  );
});
