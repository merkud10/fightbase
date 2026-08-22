import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

export const revalidate = 3600;

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompareTable } from "@/components/compare-table";
import { JsonLd } from "@/components/json-ld";
import { PageHero } from "@/components/page-hero";
import { buildPairSlug } from "@/lib/compare-pairs";
import { getComparisonPageData, getCuratedComparisonPairs } from "@/lib/db/comparison";
import { formatFightMethod, formatWeightClass, getBaseWeightClass, getDisplayName } from "@/lib/display";
import { getLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/page-metadata";
import { localizePath } from "@/lib/locale-path";
import { getSiteUrl } from "@/lib/site";

type ComparePageProps = {
  params: Promise<{ pair: string }>;
};

// Eyebrow берём по общей весовой категории: если бойцы из разных дивизионов,
// показывать чужой вес рядом с обоими именами некорректно.
function resolveSharedWeightClass(rawA: string, rawB: string) {
  const baseA = getBaseWeightClass(rawA);
  const baseB = getBaseWeightClass(rawB);

  return baseA && baseA === baseB ? baseA : "";
}

export async function generateMetadata({ params }: ComparePageProps): Promise<Metadata> {
  const { pair } = await params;
  const locale = await getLocale();
  const data = await getComparisonPageData(pair);

  if (!data) {
    // Реальный HTTP 404: метаданные считаются раньше, чем отдастся 200.
    notFound();
  }

  const { fighterA, fighterB } = data;
  const canonicalPair = buildPairSlug(fighterA.slug, fighterB.slug);
  const nameA = getDisplayName(fighterA, locale);
  const nameB = getDisplayName(fighterB, locale);
  const title =
    locale === "ru"
      ? `${nameA} против ${nameB}: сравнение бойцов UFC`
      : `${nameA} vs ${nameB}: UFC fighter comparison`;
  const description =
    locale === "ru"
      ? `${nameA} против ${nameB}: сравнение рекордов, физических данных и официальной статистики UFC — удары, тейкдауны, защита и активность.`
      : `${nameA} vs ${nameB}: comparison of records, physical measurements and official UFC statistics — striking, takedowns, defense and activity.`;

  const metadata = buildPageMetadata({
    locale,
    path: `/compare/${canonicalPair}`,
    title,
    description
  });

  const curated = await getCuratedComparisonPairs();
  const isCurated = curated.some((entry) => entry.pairSlug === canonicalPair);

  if (isCurated) {
    return metadata;
  }

  // Некурируемых комбинаций комбинаторно много — в индекс их не пускаем,
  // но ссылки со страницы обходить разрешаем.
  return {
    ...metadata,
    robots: { index: false, follow: true }
  };
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { pair } = await params;
  const locale = await getLocale();
  const data = await getComparisonPageData(pair);

  if (!data) {
    notFound();
  }

  const { fighterA, fighterB, headToHead } = data;
  const canonicalPair = buildPairSlug(fighterA.slug, fighterB.slug);

  if (canonicalPair !== pair) {
    // Обратный порядок слагов и произвольный регистр в URL сводим к одному адресу.
    permanentRedirect(localizePath(`/compare/${canonicalPair}`, locale));
  }

  const isRu = locale === "ru";
  const nameA = getDisplayName(fighterA, locale);
  const nameB = getDisplayName(fighterB, locale);
  const heroTitle = isRu ? `${nameA} против ${nameB}` : `${nameA} vs ${nameB}`;
  const sharedWeightClass = resolveSharedWeightClass(fighterA.weightClass, fighterB.weightClass);
  const eyebrow = sharedWeightClass ? formatWeightClass(sharedWeightClass, locale) : undefined;
  const dateFormatter = new Intl.DateTimeFormat(isRu ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });

  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const pageUrl = `${siteUrl}${localizePath(`/compare/${canonicalPair}`, locale)}`;
  const breadcrumbItems = [
    { label: isRu ? "Главная" : "Home", href: "/" },
    { label: isRu ? "Сравнение" : "Compare", href: "/compare" },
    { label: `${nameA} — ${nameB}` }
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? `${siteUrl}${localizePath(item.href, locale)}` : pageUrl
    }))
  };

  return (
    <main className="container">
      <JsonLd data={breadcrumbJsonLd} />
      <Breadcrumbs items={breadcrumbItems} locale={locale} />
      <PageHero
        eyebrow={eyebrow}
        title={heroTitle}
        description={
          isRu
            ? "Рекорды, физические данные и официальная статистика UFC двух бойцов рядом."
            : "Records, physical measurements and official UFC statistics side by side."
        }
      />

      {headToHead.length > 0 ? (
        <section className="policy-card" aria-label={isRu ? "Очные встречи" : "Head-to-head"}>
          <h3>{isRu ? "Очные встречи" : "Head-to-head"}</h3>
          {headToHead.map((fight) => {
            const winnerName =
              fight.winnerFighterId === fighterA.id
                ? nameA
                : fight.winnerFighterId === fighterB.id
                  ? nameB
                  : null;
            const method = formatFightMethod(fight.method, locale);
            const parts = [
              dateFormatter.format(fight.event.date),
              winnerName ? `${isRu ? "Победа" : "Winner"}: ${winnerName}` : null,
              method || null
            ].filter(Boolean);

            return (
              <p className="copy" key={fight.id}>
                <Link href={localizePath(`/events/${fight.event.slug}`, locale)}>{fight.event.name}</Link>
                {parts.length > 0 ? ` · ${parts.join(" · ")}` : null}
              </p>
            );
          })}
        </section>
      ) : null}

      <CompareTable fighterA={fighterA} fighterB={fighterB} locale={locale} />

      <section className="policy-card" aria-label={isRu ? "Профили бойцов" : "Fighter profiles"}>
        <h3>{isRu ? "Профили бойцов" : "Fighter profiles"}</h3>
        <p className="copy">
          <Link href={localizePath(`/fighters/${fighterA.slug}`, locale)}>
            {isRu ? `Профиль: ${nameA}` : `Profile: ${nameA}`}
          </Link>
          {" · "}
          <Link href={localizePath(`/fighters/${fighterB.slug}`, locale)}>
            {isRu ? `Профиль: ${nameB}` : `Profile: ${nameB}`}
          </Link>
        </p>
      </section>
    </main>
  );
}
