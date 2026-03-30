import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Политика источников",
  description:
    "Как FightBase Media работает с официальными источниками, интервью, статистическими провайдерами и подтверждением новостей.",
  alternates: {
    canonical: "/sources-policy"
  }
};

export default async function SourcesPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/sources-policy"
        title={locale === "ru" ? "Политика источников" : "Sources policy"}
        description={
          locale === "ru"
            ? "FightBase Media стремится ссылаться на первичные и проверяемые источники для новостей, карточек турниров, профилей бойцов и статистики."
            : "FightBase Media aims to rely on primary and verifiable sources for news, event cards, fighter profiles, and statistics."
        }
      />
      <section className="page-grid policy-grid">
        <article className="policy-card">
          <h3>{locale === "ru" ? "Приоритет источников" : "Source hierarchy"}</h3>
          <ul>
            <li>
              {locale === "ru"
                ? "Официальные сайты лиг и промоушенов: UFC, PFL, ONE и другие правообладатели."
                : "Official promotion and league websites such as UFC, PFL, ONE, and other rights holders."}
            </li>
            <li>
              {locale === "ru"
                ? "Интервью бойцов, тренеров, матчмейкеров и представителей промоушенов."
                : "Interviews with fighters, coaches, matchmakers, and promotion representatives."}
            </li>
            <li>
              {locale === "ru"
                ? "Официальные соцсети, пресс-релизы и статистические провайдеры."
                : "Official social channels, press releases, and verified statistics providers."}
            </li>
          </ul>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Как проверяются материалы" : "How stories are checked"}</h3>
          <p>
            {locale === "ru"
              ? "Если новость влияет на кард, титульную гонку, медицинский статус бойца, дату турнира или регуляторное решение, редакция стремится найти подтверждение минимум в одном прямом источнике. При противоречиях приоритет отдается официальным заявлениям и регуляторным публикациям."
              : "If a story affects a fight card, title picture, medical status, event date, or regulatory decision, the editorial team aims to confirm it with at least one direct source. In case of contradictions, official statements and regulatory publications take priority."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Когда материал обновляется" : "When coverage is updated"}</h3>
          <p>
            {locale === "ru"
              ? "Новости, профили бойцов, рейтинги и события обновляются, если появляются новые официальные данные: анонсы боев, изменения кардов, результаты, статистика или обновленные профили спортсменов."
              : "Stories, fighter profiles, rankings, and event pages are updated when new official information appears, including bout announcements, card changes, results, statistics, or revised athlete profiles."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Прозрачность ссылок" : "Link transparency"}</h3>
          <p>
            {locale === "ru"
              ? "Там, где это уместно, FightBase Media указывает источник материала и сохраняет ссылку на первоисточник. Это особенно важно для новостей, рейтингов, статистики и цитат."
              : "Where appropriate, FightBase Media names the source behind a story and preserves a link to the original publication. This is especially important for news, rankings, statistics, and quotations."}
          </p>
        </article>
      </section>
    </main>
  );
}
