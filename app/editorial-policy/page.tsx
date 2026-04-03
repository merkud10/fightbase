import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export const metadata: Metadata = {
  title: "Редакционная политика",
  description: "Редакционная политика FightBase Media: разграничение новостей и аналитики, точность формулировок и стандарты для UFC-покрытия.",
  alternates: buildLocaleAlternates("/editorial-policy")
};

export default async function EditorialPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/editorial-policy"
        title={locale === "ru" ? "Редакционная политика" : "Editorial policy"}
        description={
          locale === "ru"
            ? "FightBase Media разделяет новостную повестку, аналитические материалы и прогнозные форматы, чтобы читатель всегда понимал жанр текста и его назначение."
            : "FightBase Media separates news reporting, analytical writing, and prediction formats so readers always understand the type and purpose of each piece."}
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Новости" : "News"}</p>
          <h3>{locale === "ru" ? "Факты без лишнего тона" : "Facts without unnecessary color"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Новостные материалы должны быть короткими, точными и понятными. Их задача - быстро передать подтвержденное изменение в UFC-повестке и дать минимально нужный контекст."
              : "News coverage should be concise, precise, and easy to scan. Its job is to communicate a confirmed UFC development and supply only the context that matters."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Аналитика" : "Analysis"}</p>
          <h3>{locale === "ru" ? "Контекст важнее объема" : "Context matters more than volume"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Аналитические материалы должны объяснять значение новости, стилистический конфликт или место бойца в дивизионе, а не просто повторять базовый факт другими словами."
              : "Analytical work should explain the significance of a story, a stylistic clash, or a fighter's place in the division instead of merely restating the basic fact."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Прогнозы" : "Predictions"}</p>
          <h3>{locale === "ru" ? "Превью как отдельный формат" : "Previews as a distinct format"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Страницы прогнозов предназначены для предматчевого разбора. Они обновляются по регламенту и не должны маскироваться под новость или выдавать рыночные формулировки за редакционную истину."
              : "Prediction pages are built for pre-fight breakdowns. They update on a schedule and should not be framed as news reports or market truth."}
          </p>
        </article>
      </section>
    </main>
  );
}
