import type { FightPredictionSnapshot } from "@prisma/client";

import type { Locale } from "@/lib/locale-config";

export function getSnapshotContent(snapshot: FightPredictionSnapshot, locale: Locale) {
  if (locale === "ru") {
    return {
      headline: snapshot.headlineRu,
      titleTag: snapshot.titleTagRu,
      metaDescription: snapshot.metaDescriptionRu,
      excerpt: snapshot.excerptRu,
      pick: snapshot.pickRu,
      confidenceLabel: snapshot.confidenceLabelRu,
      overview: snapshot.overviewRu,
      keyEdge: snapshot.keyEdgeRu,
      fightScript: snapshot.fightScriptRu,
      formA: snapshot.formARu,
      formB: snapshot.formBRu,
      pathA: snapshot.pathARu,
      pathB: snapshot.pathBRu,
      statLines: splitSnapshotLines(snapshot.statLinesRu)
    };
  }

  return {
    headline: snapshot.headlineEn,
    titleTag: snapshot.titleTagEn,
    metaDescription: snapshot.metaDescriptionEn,
    excerpt: snapshot.excerptEn,
    pick: snapshot.pickEn,
    confidenceLabel: snapshot.confidenceLabelEn,
    overview: snapshot.overviewEn,
    keyEdge: snapshot.keyEdgeEn,
    fightScript: snapshot.fightScriptEn,
    formA: snapshot.formAEn,
    formB: snapshot.formBEn,
    pathA: snapshot.pathAEn,
    pathB: snapshot.pathBEn,
    statLines: splitSnapshotLines(snapshot.statLinesEn)
  };
}

export function splitSnapshotLines(value: string) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
