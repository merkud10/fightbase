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
        ? "Материалы FightBase публикуются для информации и не являются советом по ставкам."
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
            ? "Материалы сайта рассказывают о спорте. Это не советы по ставкам и не рекомендации, куда вкладывать деньги."
            : "FightBase Media content is published for informational purposes and should not be treated as betting, investment, or other commercial advice."}
      />

      <section className="policy-card">
        <h3>{locale === "ru" ? "О прогнозах" : "Purpose of the content"}</h3>
        <p>
          {locale === "ru"
            ? "Прогноз на бой — оценка модели, и модель ошибается: историю угаданных и неугаданных пиков мы публикуем открыто. Решение о ставке вы принимаете сами и на свой риск."
            : "The site publishes news, analytical writing, fighter profiles, and pre-fight previews as editorial content. They are meant to help readers follow UFC coverage, not make financial decisions."}
        </p>
      </section>
    </main>
  );
}
