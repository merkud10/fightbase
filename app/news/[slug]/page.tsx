import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHero } from "@/components/page-hero";
import {
  events,
  fighters,
  getArticleBySlug,
  getSourceById,
  getTagById
} from "@/lib/data";
import { getLocale } from "@/lib/i18n";

export default async function ArticlePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const relatedFighters = fighters.filter((fighter) => article.fighterIds.includes(fighter.id));
  const relatedEvent = article.eventId ? events.find((event) => event.id === article.eventId) : undefined;

  return (
    <main className="container">
      <PageHero eyebrow={`/${article.category}`} title={article.title} description={article.excerpt} />

      <section className="detail-grid">
        <article className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Краткая выжимка" : "Quick summary"}</h3>
            <p className="copy">{article.meaning}</p>
            <div className="tag-row">
              {article.tagIds.map((tagId) => (
                <span key={tagId}>{getTagById(tagId)?.label ?? tagId}</span>
              ))}
            </div>
          </div>

          <div className="policy-card">
            {article.sections.map((section) => (
              <div key={section.heading} style={{ marginBottom: 22 }}>
                <h3>{section.heading}</h3>
                <p className="copy">{section.body}</p>
              </div>
            ))}
          </div>
        </article>

        <aside className="stack">
          <div className="policy-card">
            <h3>{locale === "ru" ? "Источники" : "Sources"}</h3>
            <ul>
              {article.sourceIds.map((sourceId) => {
                const source = getSourceById(sourceId);
                return (
                  <li key={sourceId}>
                    <a href={source?.url} target="_blank" rel="noreferrer">
                      {source?.label ?? sourceId}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="policy-card">
            <h3>{locale === "ru" ? "Бойцы в материале" : "Fighters in this story"}</h3>
            <ul>
              {relatedFighters.map((fighter) => (
                <li key={fighter.id}>
                  <Link href={`/fighters/${fighter.slug}`}>{fighter.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-card">
            <h3>{locale === "ru" ? "Связанный турнир" : "Linked event"}</h3>
            <p className="copy">
              {relatedEvent ? relatedEvent.name : locale === "ru" ? "Привяжи турнир в CMS или ingestion pipeline." : "Attach event relation in CMS or pipeline."}
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}
