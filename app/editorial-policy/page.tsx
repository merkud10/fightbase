import type { Metadata } from "next";

export const revalidate = 86400;

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/editorial-policy",
    title: locale === "ru" ? "Редакционная политика" : "Editorial policy",
    description:
      locale === "ru"
        ? "Как устроены новости, превью и прогнозы на FightBase и куда писать, если мы ошиблись."
        : "FightBase Media editorial policy on separating news from analysis, accuracy, and standards for UFC coverage."
  });
}

export default async function EditorialPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/editorial-policy"
        title={locale === "ru" ? "Редакционная политика" : "Editorial policy"}
        description={
          locale === "ru"
            ? "Чем на сайте отличаются новости, превью и прогнозы и куда писать, если мы ошиблись."
            : "FightBase Media separates news reporting, analytical writing, and prediction formats so readers always understand the type and purpose of each piece."}
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Новости" : "News"}</p>
          <h3>{locale === "ru" ? "Что случилось и откуда известно" : "Facts without unnecessary color"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Новость отвечает на два вопроса: что произошло и откуда это известно. Источник указан под заголовком, прямая речь стоит в кавычках."
              : "News coverage should be concise, precise, and easy to scan. Its job is to communicate a confirmed UFC development and supply only the context that matters."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Превью и разборы" : "Analysis"}</p>
          <h3>{locale === "ru" ? "До турнира и после" : "Context matters more than volume"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Превью выходят перед турниром: кто с кем дерётся и что стоит на кону. Разборы выходят после: как прошёл бой и что он меняет в дивизионе."
              : "Analytical work should explain the significance of a story, a stylistic clash, or a fighter's place in the division instead of merely restating the basic fact."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Прогнозы" : "Predictions"}</p>
          <h3>{locale === "ru" ? "Пик не переписывается" : "Previews as a distinct format"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Прогнозы делает ИИ-модель FightBase. Пик на бой записывается до турнира и после результата не редактируется: и угаданные, и неугаданные остаются в истории точности. Прогноз не является советом делать ставки."
              : "Prediction pages are built for pre-fight breakdowns. They update on a schedule and should not be framed as news reports or market truth."}
          </p>
        </article>
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Ошибки" : "Corrections"}</p>
          <h3>{locale === "ru" ? "Если мы ошиблись" : "If we got it wrong"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Напишите нам в Telegram или VK, ссылки есть на каждой странице. Проверим и исправим."
              : "Message us on Telegram or VK using the links on any page. We will check and fix it."}
          </p>
        </article>
      </section>
    </main>
  );
}
