import type { Metadata } from "next";

export const revalidate = 86400;

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/disclaimer",
    title: locale === "ru" ? "Дисклеймер" : "Disclaimer",
    description:
      locale === "ru"
        ? "Дисклеймер FightBase Media: материалы сайта публикуются в информационных целях и не являются коммерческой рекомендацией."
        : "FightBase Media content is published for informational purposes and is not betting, investment, or commercial advice."
  });
}

export default async function DisclaimerPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/disclaimer"
        title={locale === "ru" ? "Дисклеймер" : "Disclaimer"}
        description={
          locale === "ru"
            ? "Материалы FightBase Media публикуются в информационных целях и не являются советом по ставкам, инвестициям или иным коммерческим решениям."
            : "FightBase Media content is published for informational purposes and should not be treated as betting, investment, or other commercial advice."}
      />

      <section className="policy-card">
        <h3>{locale === "ru" ? "Назначение материалов" : "Purpose of the content"}</h3>
        <p>
          {locale === "ru"
            ? "Сайт публикует новости, аналитические тексты, профили бойцов и предматчевые прогнозы как редакционные материалы. Они предназначены для чтения и навигации по UFC-повестке, а не для финансовых решений."
            : "The site publishes news, analytical writing, fighter profiles, and pre-fight previews as editorial content. They are meant to help readers follow UFC coverage, not make financial decisions."}
        </p>
      </section>
    </main>
  );
}
