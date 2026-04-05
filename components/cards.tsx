import Image from "next/image";
import Link from "next/link";

import { getArticleHref } from "@/lib/article-routes";
import {
  formatArticleTagLabel,
  formatEventLocation,
  formatFightMethod,
  formatFighterStatus,
  formatWeightClass,
  getDisplayName,
  isUsablePhoto
} from "@/lib/display";
import { getDisplayImageUrl } from "@/lib/image-proxy";
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
  tagMap?: Array<{ tag: { id: string; label: string; slug?: string | null } }>;
};

type EventFightCardData = {
  id: string;
  slug?: string | null;
  weightClass: string;
  status?: string;
  winnerFighterId?: string | null;
  method?: string | null;
  resultRound?: number | null;
  resultTime?: string | null;
  fighterAId?: string;
  fighterBId?: string;
  oddsA?: number | null;
  oddsB?: number | null;
  predictionSnapshot?: { id: string } | null;
  fighterA: { name: string; nameRu?: string | null; photoUrl?: string | null };
  fighterB: { name: string; nameRu?: string | null; photoUrl?: string | null };
};

type EventCardData = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  date: Date | string;
  city: string;
  venue?: string;
  status?: string;
  promotion?: { shortName: string } | null;
  fights?: EventFightCardData[];
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
          <Image
            src={getDisplayImageUrl(article.coverImageUrl)}
            alt={article.coverImageAlt || article.title}
            className="story-art-image"
            width={600}
            height={340}
            loading="lazy"
            unoptimized
          />
        ) : null}
        <div className="story-art-label">{metaLabel}</div>
      </div>
      <div className="story-card-meta">
        <p className="kicker">{new Date(article.publishedAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}</p>
        <span className="story-card-accent" />
      </div>
      <h3>
        <Link href={localizePath(getArticleHref(article.category as "news" | "analysis" | "interview", article.slug), locale)}>
          {article.title}
        </Link>
      </h3>
      <p className="copy">{article.excerpt}</p>
      {tags.length > 0 ? (
        <div className="tag-row">
          {tags.map(({ tag }) => (
            <span key={tag.id}>{formatArticleTagLabel(tag.slug || tag.label, locale)}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function EventCard({ event, locale }: { event: EventCardData; locale: Locale }) {
  const t = getDictionary(locale);
  const fights = event.fights ?? [];
  const leadFight = fights[0];
  const displayLocation = formatEventLocation(event.city, event.venue, locale);
  const statusLabel =
    locale === "ru"
      ? event.status === "completed"
        ? "Прошедший турнир"
        : event.status === "live"
          ? "Идет сейчас"
          : "Ближайший турнир"
      : event.status === "completed"
        ? "Completed event"
        : event.status === "live"
          ? "Live now"
          : "Upcoming event";

  return (
    <article className="event-card editorial-card event-card-rich">
      <div className="event-card-poster">
        <div className="event-card-poster-topline">
          <span className="event-card-status">{statusLabel}</span>
          <span className="event-card-poster-meta">
            {event.promotion?.shortName ?? "UFC"} · {new Date(event.date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US")}
          </span>
        </div>

        <div className="event-card-poster-body">
          {displayLocation ? <p className="kicker event-card-city">{displayLocation}</p> : null}
          <h3 className="event-card-title">{event.name}</h3>

          <div className="event-card-poster-stack">
            {leadFight ? (
              <div className="event-card-headliner">
                <span className="event-card-headliner-label">{locale === "ru" ? "Главный бой" : "Main event"}</span>
                <strong className="event-card-headliner-fight">
                  {getDisplayName(leadFight.fighterA, locale)} vs {getDisplayName(leadFight.fighterB, locale)}
                </strong>
                <span className="event-card-headliner-note">{formatWeightClass(leadFight.weightClass, locale)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <p className="copy event-card-summary">{event.summary}</p>

      {fights.length > 0 ? (
        <div className="event-fight-list">
          {fights.slice(0, 4).map((fight) => (
            <div key={fight.id} className="event-fight-row">
              <div className="event-fight-copy">
                <strong>
                  {getDisplayName(fight.fighterA, locale)} vs {getDisplayName(fight.fighterB, locale)}
                </strong>
                <span>{formatWeightClass(fight.weightClass, locale)}</span>
              </div>
              {fight.status === "completed" && fight.winnerFighterId ? (
                <span className="event-fight-result">
                  {locale === "ru" ? "Победа: " : "Winner: "}
                  <strong>
                    {fight.winnerFighterId === fight.fighterAId
                      ? getDisplayName(fight.fighterA, locale)
                      : getDisplayName(fight.fighterB, locale)}
                  </strong>
                  {fight.method ? ` (${formatFightMethod(fight.method, locale)})` : ""}
                </span>
              ) : fight.status === "completed" ? (
                <span className="event-fight-result">
                  {locale === "ru" ? "Ничья / NC" : "Draw / NC"}
                </span>
              ) : fight.predictionSnapshot && fight.slug ? (
                <Link href={localizePath(`/predictions/${event.slug}/${fight.slug}`, locale)} className="event-fight-link">
                  {t.common.openPrediction}
                </Link>
              ) : (
                <span className="event-fight-link event-fight-link--pending">
                  {locale === "ru" ? "Прогноз ожидается" : "Prediction pending"}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="event-card-actions">
        <Link href={localizePath(`/events/${event.slug}`, locale)} className="button-secondary event-card-button">
          {t.common.eventCard}
        </Link>
      </div>
    </article>
  );
}

export function FighterCard({ fighter, locale }: { fighter: FighterCardData; locale: Locale }) {
  const t = getDictionary(locale);
  const displayName = locale === "ru" ? fighter.nameRu ?? fighter.name : fighter.name;
  const hasRecord = Boolean(fighter.record && fighter.record !== "-" && fighter.record !== "0-0" && fighter.record !== "0-0-0");
  const hasUsablePhoto = isUsablePhoto(fighter.photoUrl);

  return (
    <article className="fighter-card editorial-card fighter-card-editorial">
      {hasUsablePhoto ? (
        <Image
          src={getDisplayImageUrl(String(fighter.photoUrl))}
          alt={displayName}
          className="fighter-photo"
          width={300}
          height={300}
          loading="lazy"
          unoptimized
        />
      ) : (
        <div className="fighter-avatar" />
      )}
      <p className="kicker">{fighter.promotion?.shortName ?? "UFC"}</p>
      <h3>{displayName}</h3>
      <p className="copy">
        {hasRecord ? `${fighter.record} · ` : ""}
        {formatWeightClass(fighter.weightClass, locale)}
      </p>
      <span className="status-pill">{formatFighterStatus(fighter.status, locale)}</span>
      <div className="fighter-card-actions">
        <Link href={localizePath(`/fighters/${fighter.slug}`, locale)} className="button-secondary fighter-card-button">
          {t.common.profile}
        </Link>
      </div>
    </article>
  );
}
