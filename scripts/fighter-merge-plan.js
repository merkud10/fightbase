// План склейки пустого дубля бойца с полным профилем — чистая функция без базы,
// чтобы правила можно было проверить тестами до запуска на проде.
//
// Случай ноября 2026: импорт карда завёл gabriel-lorenco и jose-souza новыми
// пустыми записями (ESPN сменил написание имени), бои и прогнозы привязались к
// ним, а полные профили остались под gabriel-lourenco и jose-henrique.
// В отличие от repair-ufc-duplicate-fighters.js у такого дубля есть бои: их
// нужно перенести, а не потерять.

function hasUsablePhoto(url) {
  const raw = String(url || "").trim();
  return Boolean(raw) && !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(raw);
}

function opponentOf(fight, fighterId) {
  if (fight.fighterAId === fighterId) return fight.fighterBId;
  if (fight.fighterBId === fighterId) return fight.fighterAId;
  return null;
}

// Возвращает { ok: true, actions, setEspnId } или { ok: false, reason }.
// Действия:
//   repoint      — бой дубля переводим на полный профиль;
//   absorb       — то же, но у полного профиля уже есть этот бой (тот же турнир и
//                  соперник): оставляем бой дубля (на нём адрес и прогноз),
//                  результат берём из боя-близнеца, близнеца удаляем;
//   drop         — оставляем бой полного профиля, бой дубля удаляем.
function planFighterMerge({ duplicate, canonical, duplicateFights, canonicalFights, expectedEspnId }) {
  if (!duplicate) return { ok: false, reason: "дубль не найден (уже склеен?)" };
  if (!canonical) return { ok: false, reason: "полный профиль не найден" };
  if (duplicate.id === canonical.id) return { ok: false, reason: "дубль и полный профиль — одна запись" };

  if (expectedEspnId && duplicate.espnId !== expectedEspnId && canonical.espnId !== expectedEspnId) {
    return { ok: false, reason: `ни одна запись не привязана к ESPN ${expectedEspnId}` };
  }
  // Склеиваем только пустую запись с полной: иначе удаление потеряет данные.
  if (String(duplicate.record || "").trim() || hasUsablePhoto(duplicate.photoUrl)) {
    return { ok: false, reason: "дубль не пустой: у него есть рекорд или фото" };
  }
  if (!String(canonical.record || "").trim()) {
    return { ok: false, reason: "у полного профиля нет рекорда" };
  }

  const actions = [];

  for (const fight of duplicateFights) {
    const opponentId = opponentOf(fight, duplicate.id);
    if (!opponentId) return { ok: false, reason: `бой ${fight.id} не принадлежит дублю` };
    if (opponentId === canonical.id) return { ok: false, reason: `бой ${fight.id}: дубль записан соперником полного профиля` };

    const twins = canonicalFights.filter(
      (candidate) => candidate.eventId === fight.eventId && opponentOf(candidate, canonical.id) === opponentId
    );
    if (twins.length > 1) return { ok: false, reason: `бой ${fight.id}: у полного профиля несколько таких же боёв` };
    const twin = twins[0];

    if (!twin) {
      actions.push({ type: "repoint", fightId: fight.id, fightSlug: fight.slug });
      continue;
    }
    if (fight.hasPrediction && twin.hasPrediction) {
      return { ok: false, reason: `бой ${fight.id}: прогноз есть и у боя дубля, и у боя полного профиля` };
    }

    if (fight.hasPrediction || (!twin.hasPrediction && fight.status === "completed" && twin.status !== "completed")) {
      const takeResult = fight.status !== "completed" && twin.status === "completed";
      actions.push({
        type: "absorb",
        fightId: fight.id,
        fightSlug: fight.slug,
        deleteFightId: twin.id,
        deleteFightSlug: twin.slug,
        // Победитель в бое-близнеце записан уже на полный профиль или на соперника.
        result: takeResult
          ? {
              status: twin.status,
              resultType: twin.resultType,
              winnerFighterId: twin.winnerFighterId,
              method: twin.method,
              resultRound: twin.resultRound,
              resultTime: twin.resultTime
            }
          : null
      });
    } else {
      actions.push({ type: "drop", fightId: fight.id, fightSlug: fight.slug, keepFightId: twin.id, keepFightSlug: twin.slug });
    }
  }

  return {
    ok: true,
    actions,
    // Привязку к ESPN после удаления дубля держит полный профиль.
    setEspnId: expectedEspnId && canonical.espnId !== expectedEspnId ? expectedEspnId : null
  };
}

module.exports = { planFighterMerge };
