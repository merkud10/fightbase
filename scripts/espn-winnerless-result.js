// Scoreboard ESPN не отличает ничью и несостоявшийся бой от боя, по которому
// ещё нет исхода: у обоих бойцов winner=false, а в details нет ни «Draw», ни
// «No Contest». Явный исход лежит только в core API, в status.result
// (name: "draw" / "no-contest"). Проверено на UFC 334 (Медич — Холланд),
// UFC 282 (Блахович — Анкалаев) и UFC 294 (Анкалаев — Уокер).
const CORE_COMPETITION_URL = "https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events";

function competitionStatusUrl(eventId, competitionId) {
  return `${CORE_COMPETITION_URL}/${eventId}/competitions/${competitionId}/status`;
}

function classifyWinnerlessResult(status) {
  const result = status?.result;
  const text = [result?.name, result?.displayName, result?.shortDisplayName].filter(Boolean).join(" ");
  if (/no[\s-]*contest|\bn\/?c\b/i.test(text)) return { resultType: "no_contest", method: "No Contest" };
  if (/draw/i.test(text)) return { resultType: "draw", method: "Draw" };
  return null;
}

// Дополняет разобранные бои на месте. Сбой запроса не роняет синк карда:
// бой остаётся без типа результата, и следующий запуск спросит снова.
async function resolveWinnerlessResults(fights, fetchJson, warn = console.warn) {
  for (const fight of fights) {
    if (!fight.hasResult || fight.winnerOrder || fight.resultType) continue;
    if (!fight.espnEventId || !fight.espnCompetitionId) continue;

    try {
      const resolved = classifyWinnerlessResult(
        await fetchJson(competitionStatusUrl(fight.espnEventId, fight.espnCompetitionId))
      );
      if (!resolved) continue;
      fight.resultType = resolved.resultType;
      // Метод из scoreboard здесь ненадёжен: у ничьей он брался из хода боя
      // («Submission Attempt» давал «Submission»).
      fight.method = resolved.method;
    } catch (error) {
      warn(`  ESPN result lookup for competition ${fight.espnCompetitionId} failed: ${error.message}`);
    }
  }
}

module.exports = { classifyWinnerlessResult, competitionStatusUrl, resolveWinnerlessResults };
