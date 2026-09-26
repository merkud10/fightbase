import { emptyRoiBucket, addToRoiBucket } from "./prediction-roi";

type ScoredFight = {
  modelVerdict: string;
  favoriteVerdict: string;
  pickUnits: number | null;
  favoriteUnits: number | null;
  pickAgainstOdds: boolean;
  lockedBeforeEvent: boolean;
};
const scored = (verdict: string) => verdict === "correct" || verdict === "wrong";

export function comparePredictions(fights: ScoredFight[]) {
  const paired = fights.filter((fight) => fight.lockedBeforeEvent && scored(fight.modelVerdict) && scored(fight.favoriteVerdict));
  const roiFights = paired.filter((fight) => fight.pickUnits !== null && Number.isFinite(fight.pickUnits) && fight.favoriteUnits !== null && Number.isFinite(fight.favoriteUnits));
  const modelRoi = emptyRoiBucket();
  const favoriteRoi = emptyRoiBucket();
  for (const fight of roiFights) {
    addToRoiBucket(modelRoi, fight.pickUnits);
    addToRoiBucket(favoriteRoi, fight.favoriteUnits);
  }
  const bucket = (items: ScoredFight[]) => ({ judged: items.length, correct: items.filter((fight) => fight.modelVerdict === "correct").length });
  return {
    model: bucket(paired),
    favorite: { judged: paired.length, correct: paired.filter((fight) => fight.favoriteVerdict === "correct").length },
    favorites: bucket(paired.filter((fight) => !fight.pickAgainstOdds)),
    underdogs: bucket(paired.filter((fight) => fight.pickAgainstOdds)),
    modelRoi,
    favoriteRoi,
    excluded: fights.length - paired.length,
    missingOdds: paired.length - roiFights.length,
    unverifiedTiming: fights.filter((fight) => !fight.lockedBeforeEvent).length
  };
}
