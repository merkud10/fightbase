import Link from "next/link";

import { formatFighterStatus, formatWeightClass } from "@/lib/display";
import { getDictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";

type ArticleCardData = {
  id: string;
  slug: string;
  title: string;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
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
  nameRu?: string | null;
  photoUrl?: string | null;
  record: string;
  weightClass: string;
  status: string;
  promotion?: { shortName: string } | null;
};

export function ArticleCard({ article, locale }: { article: ArticleCardData; locale: Locale }) {
  const metaLabel = article.promotion?.shortName ?? article.category.toUpperCase();
  const tags = (article.tagMap ?? []).slice(0, 2);

  return (
    <article className="story-card editorial-card">
      <div className="story-art">
        {article.coverImageUrl ? (
          <img src={article.coverImageUrl} alt={article.coverImageAlt || article.title} className="story-art-image" />
        ) : null}
        <div className="story-art-label">{metaLabel}</div>
      </div>
      <p className="kicker">{new Date(article.publishedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</p>
      <h3>
        <Link href={localizePath(`/news/${article.slug}`, locale)}>{article.title}</Link>
      </h3>
      <p className="copy">{article.excerpt}</p>
      {tags.length > 0 ? (
        <div className="tag-row">
          {tags.map(({ tag }) => (
            <span key={tag.id}>{tag.label}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function EventCard({ event, locale }: { event: EventCardData; locale: Locale }) {
  const t = getDictionary(locale);
  const mainFight = event.fights?.[0];

  return (
    <article className="event-card editorial-card">
      <p className="kicker">
        {event.promotion?.shortName ?? "MMA"} · {new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")} · {event.city}
      </p>
      <h3>{event.name}</h3>
      <p className="copy">{event.summary}</p>
      <p className="copy">
        {locale === "ru" ? "Главный бой" : "Main event"}: {mainFight ? `${mainFight.fighterA.name} vs ${mainFight.fighterB.name}` : "TBD"}
      </p>
      <Link href={localizePath(`/events/${event.slug}`, locale)} className="button-secondary">
        {t.common.eventCard}
      </Link>
    </article>
  );
}

export function FighterCard({ fighter, locale }: { fighter: FighterCardData; locale: Locale }) {
  const t = getDictionary(locale);
  const displayName = locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
  const hasRecord = Boolean(fighter.record && fighter.record !== "-" && fighter.record !== "0-0" && fighter.record !== "0-0-0");
  const hasUsablePhoto =
    Boolean(fighter.photoUrl) &&
    !/silhouette|logo_of_the_ultimate_fighting_championship|flag_of_|\/themes\/custom\/ufc\/assets\/img\//i.test(
      String(fighter.photoUrl)
    );

  return (
    <article className="fighter-card editorial-card fighter-card-editorial">
      {hasUsablePhoto ? <img src={String(fighter.photoUrl)} alt={displayName} className="fighter-photo" /> : <div className="fighter-avatar" />}
      <p className="kicker">{fighter.promotion?.shortName ?? "MMA"}</p>
      <h3>{displayName}</h3>
      <p className="copy">
        {hasRecord ? `${fighter.record} · ` : ""}
        {formatWeightClass(fighter.weightClass, locale)}
      </p>
      <span className="status-pill">{formatFighterStatus(fighter.status, locale)}</span>
      <div style={{ marginTop: 18 }}>
        <Link href={localizePath(`/fighters/${fighter.slug}`, locale)} className="button-secondary">
          {t.common.profile}
        </Link>
      </div>
    </article>
  );
}
