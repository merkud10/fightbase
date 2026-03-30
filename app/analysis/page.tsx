import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { getAnalysisPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export async function generateMetadata(): Promise<Metadata> {
  const analysis = await getAnalysisPageData();

  return {
    title: "Аналитика MMA",
    description: "Тактические разборы, превью и постфайт-материалы FightBase Media.",
    alternates: buildLocaleAlternates("/analysis"),
    robots: analysis.length
      ? undefined
      : {
          index: false,
          follow: true
        }
  };
}

export default async function AnalysisPage() {
  const locale = await getLocale();
  const analysis = await getAnalysisPageData();

  return (
    <main className="container">
      <PageHero
        eyebrow="/analysis"
        title={locale === "ru" ? "Аналитика" : "Analysis"}
        description={
          locale === "ru"
            ? "Превью, тактические разборы, постфайт-материалы и матчмейкинг, которые делают сайт осмысленным."
            : "Preview pieces, tactical breakdowns, post-fight reads, and matchmaking coverage that make the site feel intentional."
        }
      />

      <section className="feature-grid">
        {analysis.map((article) => (
          <article key={article.id} className="feature-card">
            <p className="eyebrow">{article.category}</p>
            <h3>{article.title}</h3>
            <p className="copy">{article.excerpt}</p>
            <Link href={`/news/${article.slug}`}>{locale === "ru" ? "Читать материал" : "Read article"}</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
