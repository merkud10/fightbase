import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export const metadata: Metadata = {
  title: "Видео MMA",
  description: "Раздел видео находится в подготовке и пока не предназначен для индексации.",
  alternates: buildLocaleAlternates("/videos"),
  robots: {
    index: false,
    follow: false
  }
};

export default async function VideosPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/videos"
        title={locale === "ru" ? "Видео" : "Videos"}
        description={
          locale === "ru"
            ? "Будущий раздел для официальных встраиваний, хайлайтов, пресс-конференций, face-off и редакционных подборок."
            : "A future home for official embeds, highlight collections, press conferences, face-offs, and editorial wraparounds."
        }
      />

      <section className="feature-grid">
        <article className="feature-card">
          <p className="eyebrow">{locale === "ru" ? "Хайлайты" : "Highlights"}</p>
          <h3>{locale === "ru" ? "Лучшие финиши месяца" : "Best finishes of the month"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Кураторские официальные клипы, заметки редакции и ссылки на бойцов и турниры."
              : "Curated official clips plus editorial notes and internal links to fighters and event pages."}
          </p>
        </article>
        <article className="feature-card">
          <p className="eyebrow">{locale === "ru" ? "Пресс-конференции" : "Pressers"}</p>
          <h3>{locale === "ru" ? "Пресс-конференции с выжимкой" : "Press conferences with takeaways"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Встраивай источник и кратко пересказывай моменты, которые реально двигают дивизион."
              : "Embed the source and summarize the moments that actually move the division."}
          </p>
        </article>
        <article className="feature-card">
          <p className="eyebrow">Social</p>
          <h3>{locale === "ru" ? "Face-off и реакционные клипы" : "Face-offs and reaction clips"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Короткие форматы, которые напрямую подпитывают новости и таймлайны бойцов."
              : "Short-form moments that feed directly into news stories and fighter timelines."}
          </p>
        </article>
      </section>
    </main>
  );
}
