import Link from "next/link";

import {
  getFightById,
  fighters,
  getPromotionById,
  getTagById,
} from "@/lib/data";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/locale-config";
import type { Article, Event, Fighter } from "@/lib/types";

export function ArticleCard({ article, locale }: { article: Article; locale: Locale }) {
  const promotion = getPromotionById(article.promotionId);
  const t = getDictionary(locale);

  return (
    <article className="story-card">
      <div className="story-art" />
      <p className="kicker">
        {promotion?.shortName ?? article.category.toUpperCase()} - {new Date(article.publishedAt).toLocaleDateString("en-US")}
      </p>
      <h3>
        <Link href={`/news/${article.slug}`}>{article.title}</Link>
      </h3>
      <p className="copy">{article.excerpt}</p>
      <div className="tag-row">
        {article.tagIds.slice(0, 2).map((tagId) => {
          const tag = getTagById(tagId);
          return <span key={tagId}>{tag?.label ?? tagId}</span>;
        })}
      </div>
    </article>
  );
}

export function EventCard({ event, locale }: { event: Event; locale: Locale }) {
  const promotion = getPromotionById(event.promotionId);
  const mainFight = getFightById(event.mainEventFightId);
  const fighterA = fighters.find((fighter) => fighter.id === mainFight?.fighterAId);
  const fighterB = fighters.find((fighter) => fighter.id === mainFight?.fighterBId);
  const t = getDictionary(locale);

  return (
    <article className="event-card">
      <p className="kicker">
        {promotion?.shortName} - {new Date(event.date).toLocaleDateString("en-US")} - {event.city}
      </p>
      <h3>{event.name}</h3>
      <p className="copy">{event.summary}</p>
      <p className="copy">
        {locale === "ru" ? "Главный бой" : "Main event"}: {fighterA && fighterB ? `${fighterA.name} vs ${fighterB.name}` : "TBD"}
      </p>
      <Link href={`/events/${event.slug}`} className="button-secondary">
        {t.common.eventCard}
      </Link>
    </article>
  );
}

export function FighterCard({ fighter, locale }: { fighter: Fighter; locale: Locale }) {
  const promotion = getPromotionById(fighter.promotionId);
  const t = getDictionary(locale);

  return (
    <article className="fighter-card">
      <div className="fighter-avatar" />
      <h3>{fighter.name}</h3>
      <p className="copy">
        {fighter.record} - {fighter.weightClass}
      </p>
      <p className="copy">{promotion?.shortName}</p>
      <span className="status-pill">{fighter.status}</span>
      <div style={{ marginTop: 16 }}>
        <Link href={`/fighters/${fighter.slug}`} className="button-secondary">
          {t.common.profile}
        </Link>
      </div>
    </article>
  );
}
