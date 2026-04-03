import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export const metadata: Metadata = {
  title: "О FightBase Media",
  description: "О FightBase Media: редакционный подход, структура UFC-медиа, принципы работы с новостями, аналитикой, турнирами и профилями бойцов.",
  alternates: buildLocaleAlternates("/about")
};

export default async function AboutPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/about"
        title={locale === "ru" ? "О FightBase" : "About FightBase"}
        description={
          locale === "ru"
            ? "FightBase Media - профильное UFC-медиа, где новости, турниры, профили бойцов, рейтинги и прогнозы собраны в единую редакционную систему."
            : "FightBase Media is a UFC-focused publication where news, event pages, fighter profiles, rankings, and previews live in one editorial system."
        }
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Позиция" : "Positioning"}</p>
          <h3>{locale === "ru" ? "Не агрегатор, а редакционный проект" : "Not an aggregator, but an editorial product"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "FightBase строится как медиа о UFC, а не как лента случайных пересказов. Каждый раздел должен помогать читателю быстро понять, что произошло, почему это важно и куда смотреть дальше."
              : "FightBase is built as a UFC publication rather than a stream of disconnected rewrites. Each section should explain what happened, why it matters, and where to go next."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Структура" : "Structure"}</p>
          <h3>{locale === "ru" ? "Новости, бойцы и турниры связаны между собой" : "News, fighters, and events are connected"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Материалы привязаны к бойцам и турнирам, турнирные страницы ведут к прогнозам, а профили бойцов собирают статистику, последние бои и связанные истории."
              : "Stories are tied to fighters and events, event pages lead into prediction pages, and fighter profiles collect stats, recent bouts, and related coverage."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Фокус" : "Focus"}</p>
          <h3>{locale === "ru" ? "UFC как единая редакционная повестка" : "UFC as one connected beat"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Сайт временно сосредоточен на UFC, чтобы сделать покрытие глубже и чище: меньше шумовых тем, больше связанного контекста и сильнее поисковая структура."
              : "The site currently focuses on UFC to keep coverage deeper, cleaner, and more tightly connected."}
          </p>
        </article>
      </section>
    </main>
  );
}
