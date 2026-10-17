import { prisma } from "@/lib/prisma";

// История боёв (FighterRecentFight) хранит соперника строкой, а русское имя
// синк получал транслитерацией: «Dustin Poirier» → «Дустин Поириер», хотя у
// самого Порье в карточке имя верное. Индекс сопоставляет соперника с его
// карточкой по ключу имени — тому же, что у синков (scripts/fighter-name-matching.js):
// без диакритики, суффиксов Jr./III и порядка слов.

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

export function fighterNameKey(value: string | null | undefined) {
  return String(value || "")
    .replace(/ł/gi, "l")
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLowerCase()
    .replace(/^by\s+/, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !NAME_SUFFIXES.has(token))
    .sort()
    .join(" ");
}

export type IndexedFighter = { slug: string; name: string; nameRu: string | null };

// Ключ → боец; при однофамильцах-тёзках (два профиля с одним ключом) ключ
// неоднозначен, и ссылку не ставим, чтобы не увести на чужую карточку.
export function buildFighterNameIndex(fighters: IndexedFighter[]) {
  const index = new Map<string, IndexedFighter | null>();
  for (const fighter of fighters) {
    const key = fighterNameKey(fighter.name);
    if (!key) continue;
    index.set(key, index.has(key) ? null : fighter);
  }
  return index;
}

const TTL_MS = 10 * 60 * 1000;
let cached: { at: number; index: Map<string, IndexedFighter | null> } | null = null;

export async function getFighterNameIndex() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.index;
  const fighters = await prisma.fighter.findMany({ select: { slug: true, name: true, nameRu: true } });
  cached = { at: Date.now(), index: buildFighterNameIndex(fighters) };
  return cached.index;
}
