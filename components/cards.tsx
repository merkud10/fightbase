import Link from "next/link";

import { formatFighterStatus, formatWeightClass } from "@/lib/display";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/locale-config";

type ArticleCardData = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date | string;
  category: string;
  promotion?: { shortName: string } | null;
  tagMap?: Array<{ tag: { id: string; label: string } }>;
};

type EventCardData = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  date: Date | string;
  city: string;
  promotion?: { shortName: string } | null;
  fights?: Array<{ fighterA: { name: string }; fighterB: { name: string } }>;
};

type FighterCardData = {
  id: string;
  slug: string;
  name: string;
  record: string;
  weightClass: string;
  status: string;
  promotion?: { shortName: string } | null;
};

export function ArticleCard({ article, locale }: { article: ArticleCardData; locale: Locale }) {
  return (
    <article className="story-card">
      <div className="story-art" />
      <p className="kicker">
        {article.promotion?.shortName ?? article.category.toUpperCase()} -{" "}
        {new Date(article.publishedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}
      </p>
      <h3>
        <Link href={`/news/${article.slug}`}>{article.title}</Link>
      </h3>
      <p className="copy">{article.excerpt}</p>
      <div className="tag-row">
        {(article.tagMap ?? []).slice(0, 2).map(({ tag }) => (
          <span key={tag.id}>{tag.label}</span>
        ))}
      </div>
    </article>
  );
}

export function EventCard({ event, locale }: { event: EventCardData; locale: Locale }) {
  const t = getDictionary(locale);
  const mainFight = event.fights?.[0];

  return (
    <article className="event-card">
      <p className="kicker">
        {event.promotion?.shortName ?? "MMA"} -{" "}
        {new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} - {event.city}
      </p>
      <h3>{event.name}</h3>
      <p className="copy">{event.summary}</p>
      <p className="copy">
        {locale === "ru" ? "Главный бой" : "Main event"}:{" "}
        {mainFight ? `${mainFight.fighterA.name} vs ${mainFight.fighterB.name}` : "TBD"}
      </p>
      <Link href={`/events/${event.slug}`} className="button-secondary">
        {t.common.eventCard}
      </Link>
    </article>
  );
}

export function FighterCard({ fighter, locale }: { fighter: FighterCardData; locale: Locale }) {
  const t = getDictionary(locale);

  return (
    <article className="fighter-card">
      <div className="fighter-avatar" />
      <h3>{fighter.name}</h3>
      <p className="copy">
        {fighter.record} - {formatWeightClass(fighter.weightClass, locale)}
      </p>
      <p className="copy">{fighter.promotion?.shortName ?? "MMA"}</p>
      <span className="status-pill">{formatFighterStatus(fighter.status, locale)}</span>
      <div style={{ marginTop: 16 }}>
        <Link href={`/fighters/${fighter.slug}`} className="button-secondary">
          {t.common.profile}
        </Link>
      </div>
    </article>
  );
}
