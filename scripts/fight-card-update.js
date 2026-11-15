// Обновление уже заведённого боя при синке карда. Порядок бойцов A/B не
// меняем, даже если ESPN их переставил: к нему привязаны шанс бойца A, кэфы на
// момент пика и тексты «путь к победе» в FightPredictionSnapshot. После
// перестановки они молча доставались другому бойцу (Диас — Алатенгхеили,
// UFC 334). Победитель хранится идентификатором бойца и от порядка не зависит.
function planExistingFightUpdate(data) {
  const { fighterAId: _fighterAId, fighterBId: _fighterBId, ...update } = data;
  return update;
}

module.exports = { planExistingFightUpdate };
