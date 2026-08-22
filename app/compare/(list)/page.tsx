import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHero } from "@/components/page-hero";
import { getNamedCuratedComparisonPairs, type NamedCuratedPair } from "@/lib/db/comparison";
import { formatWeightClass, getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isRu = locale === "ru";

  return buildPageMetadata({
    locale,
    path: "/compare",
    title: isRu ? "Сравнение бойцов UFC" : "UFC fighter comparison",
    description: isRu
      ? "Сравнение бойцов UFC по дивизионам: рекорды, физические данные и официальная статистика двух бойцов рядом."
      : "UFC fighter comparison by division: records, physical measurements and official statistics side by side."
  });
}

type PairGroup = {
  key: string;
  title: string;
  pairs: Array<NamedCuratedPair & { label: string }>;
};

function buildGroups(pairs: NamedCuratedPair[], locale: Locale): PairGroup[] {
  const isRu = locale === "ru";
  const collator = new Intl.Collator(isRu ? "ru" : "en");
  const byKey = new Map<string, PairGroup>();

  for (const pair of pairs) {
    const key = pair.weightClass ?? "";
    const title = pair.weightClass
      ? formatWeightClass(pair.weightClass, locale)
      : isRu
        ? "Другие пары"
        : "Other pairs";
    const group = byKey.get(key) ?? { key, title, pairs: [] };
    const nameA = getDisplayName(pair.fighterA, locale);
    const nameB = getDisplayName(pair.fighterB, locale);

    group.pairs.push({ ...pair, label: `${nameA} — ${nameB}` });
    byKey.set(key, group);
  }

  // Порядок фиксируем сортировкой, а не порядком обхода данных: иначе список
  // перетасовывался бы между сборками при том же наборе пар.
  for (const group of byKey.values()) {
    group.pairs.sort((a, b) => collator.compare(a.label, b.label));
  }

  const groups = [...byKey.values()];
  const named = groups.filter((group) => group.key !== "").sort((a, b) => collator.compare(a.title, b.title));
  const rest = groups.filter((group) => group.key === "");

  return [...named, ...rest];
}

export default async function CompareHubPage() {
  const locale = await getLocale();
  const isRu = locale === "ru";
  const pairs = await getNamedCuratedComparisonPairs();
  const groups = buildGroups(pairs, locale);
  const breadcrumbItems = [
    { label: isRu ? "Главная" : "Home", href: "/" },
    { label: isRu ? "Сравнение" : "Compare" }
  ];

  return (
    <main className="container">
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow="UFC"
        title={isRu ? "Сравнение бойцов UFC" : "UFC fighter comparison"}
        description={
          isRu
            ? "Рекорды, физические данные и официальная статистика UFC двух бойцов рядом. Ниже — пары из рейтингов и афиши, сгруппированные по дивизионам."
            : "Records, physical measurements and official UFC statistics side by side. Below are pairs from the rankings and the schedule, grouped by division."
        }
      />

      {groups.length === 0 ? (
        <section className="policy-card compare-hub-group">
          <p className="copy">
            {isRu ? "Пары для сравнения пока не собраны." : "No comparison pairs are available yet."}
          </p>
        </section>
      ) : (
        groups.map((group) => (
          <section className="policy-card compare-hub-group" aria-label={group.title} key={group.key || "other"}>
            <h2 className="compare-hub-title">
              {group.title}
              <span className="compare-hub-count">{group.pairs.length}</span>
            </h2>
            <ul className="compare-hub-list">
              {group.pairs.map((pair) => (
                <li className="compare-hub-item" key={pair.pairSlug}>
                  <Link href={localizePath(`/compare/${pair.pairSlug}`, locale)}>{pair.label}</Link>
                  {pair.isScheduled ? (
                    <span className="compare-hub-badge">{isRu ? "В афише" : "Scheduled"}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
