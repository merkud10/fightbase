import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export const metadata: Metadata = {
  title: "Видео UFC",
  description: "Раздел видео FightBase Media готовится к запуску и пока закрыт от индексации.",
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
            ? "Раздел готовится как отдельная витрина для официальных фрагментов, медиа-дней, хайлайтов и встроенного видеоконтента вокруг главных событий UFC."
            : "This section is being prepared as a curated desk for official clips, media-day footage, highlights, and event-related video coverage."
        }
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Что появится" : "What is coming"}</p>
          <h3>{locale === "ru" ? "Хайлайты, пресс-конференции и face-off" : "Highlights, press conferences, and face-offs"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Когда раздел будет заполнен, он станет отдельной точкой входа в видеоповестку UFC, а не просто набором случайных роликов."
              : "When it launches, the page will work as a structured UFC video desk rather than a loose list of clips."}
          </p>
        </article>
      </section>
    </main>
  );
}
