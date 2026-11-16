import type { Metadata } from "next";

export const revalidate = 3600;

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return {
    ...buildPageMetadata({
      locale,
      path: "/videos",
      title: locale === "ru" ? "Видео UFC" : "UFC videos",
      description:
        locale === "ru"
          ? "Раздел видео ещё не открыт."
          : "The FightBase Media video section is being prepared for launch and is currently excluded from indexing."
    }),
    robots: {
      index: false,
      follow: false
    }
  };
}

export default async function VideosPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/videos"
        title={locale === "ru" ? "Видео" : "Videos"}
        description={
          locale === "ru"
            ? "Здесь будут хайлайты турниров, пресс-конференции и дуэли взглядов."
            : "This section is being prepared as a curated desk for official clips, media-day footage, highlights, and event-related video coverage."
        }
      />

      <section className="feature-grid">
        <article className="feature-card editorial-card">
          <p className="eyebrow">{locale === "ru" ? "Что появится" : "What is coming"}</p>
          <h3>{locale === "ru" ? "Хайлайты, пресс-конференции и face-off" : "Highlights, press conferences, and face-offs"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "Раздел откроется, когда наберётся достаточно видео."
              : "When it launches, the page will work as a structured UFC video desk rather than a loose list of clips."}
          </p>
        </article>
      </section>
    </main>
  );
}
