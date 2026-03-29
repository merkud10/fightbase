import Link from "next/link";
import type { ArticleStatus } from "@prisma/client";

import { bulkUpdateArticleStatusAction, quickUpdateArticleStatusAction } from "@/app/admin/actions";
import { AdminArticleForm } from "@/components/admin-article-form";
import { AdminEventForm } from "@/components/admin-event-form";
import { AdminFighterForm } from "@/components/admin-fighter-form";
import { AdminIngestForm } from "@/components/admin-ingest-form";
import { AdminSourceForm } from "@/components/admin-source-form";
import { AdminTagForm } from "@/components/admin-tag-form";
import { PageHero } from "@/components/page-hero";
import { getAdminDashboardData, getAdminEditorOptions } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const articleStatuses = ["draft", "review", "published"] as const satisfies readonly ArticleStatus[];
const moderationSortValues = ["newest", "aiDesc", "aiAsc"] as const;
const confidenceThresholdValues = ["0.5", "0.7"] as const;

type AdminPageSearchParams = {
  status?: string | string[];
  fighterDelete?: string | string[];
  eventDelete?: string | string[];
  tagDelete?: string | string[];
  bulkUpdate?: string | string[];
  aiOnly?: string | string[];
  minConfidence?: string | string[];
  sort?: string | string[];
};

function resolveStatusFilter(status: string | string[] | undefined): ArticleStatus | undefined {
  if (typeof status !== "string") {
    return undefined;
  }

  return articleStatuses.find((value) => value === status);
}

function resolveSort(sort: string | string[] | undefined) {
  if (typeof sort !== "string") {
    return "newest";
  }

  return moderationSortValues.find((value) => value === sort) ?? "newest";
}

function resolveMinConfidence(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  return confidenceThresholdValues.find((entry) => entry === value);
}

function isAiOnly(value: string | string[] | undefined) {
  return value === "1";
}

function buildAdminHref(filters: {
  status?: ArticleStatus;
  aiOnly?: boolean;
  minConfidence?: string;
  sort?: "newest" | "aiDesc" | "aiAsc";
}) {
  const query = new URLSearchParams();

  if (filters.status) {
    query.set("status", filters.status);
  }

  if (filters.aiOnly) {
    query.set("aiOnly", "1");
  }

  if (filters.minConfidence) {
    query.set("minConfidence", filters.minConfidence);
  }

  if (filters.sort && filters.sort !== "newest") {
    query.set("sort", filters.sort);
  }

  const search = query.toString();
  return search ? `/admin?${search}` : "/admin";
}

function getStatusLabel(locale: "ru" | "en", status: "all" | ArticleStatus) {
  if (locale === "ru") {
    switch (status) {
      case "all":
        return "Все";
      case "draft":
        return "Черновики";
      case "review":
        return "На проверке";
      case "published":
        return "Опубликовано";
    }
  }

  switch (status) {
    case "all":
      return "All";
    case "draft":
      return "Drafts";
    case "review":
      return "Review";
    case "published":
      return "Published";
  }
}

function getBulkMessage(locale: "ru" | "en", value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "empty") {
    return locale === "ru"
      ? "Выбери хотя бы одну статью для массового действия."
      : "Select at least one article for a bulk action.";
  }

  const [status, count] = value.split(":");
  if (!status || !count) {
    return null;
  }

  if (locale === "ru") {
    if (status === "review") {
      return `Переведено в review: ${count}.`;
    }

    if (status === "published") {
      return `Опубликовано статей: ${count}.`;
    }
  }

  if (status === "review") {
    return `Moved to review: ${count}.`;
  }

  if (status === "published") {
    return `Published articles: ${count}.`;
  }

  return null;
}

function getSortLabel(locale: "ru" | "en", sort: "newest" | "aiDesc" | "aiAsc") {
  if (locale === "ru") {
    if (sort === "aiDesc") {
      return "AI score: высокий -> низкий";
    }

    if (sort === "aiAsc") {
      return "AI score: низкий -> высокий";
    }

    return "Сначала новые";
  }

  if (sort === "aiDesc") {
    return "AI score: high to low";
  }

  if (sort === "aiAsc") {
    return "AI score: low to high";
  }

  return "Newest first";
}

function getScoreTone(score: number | null) {
  if (score == null) {
    return "muted";
  }

  if (score >= 0.7) {
    return "high";
  }

  if (score >= 0.5) {
    return "medium";
  }

  return "low";
}

function formatDate(date: Date | string, locale: "ru" | "en") {
  return new Date(date).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US");
}

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<AdminPageSearchParams>;
}) {
  const locale = await getLocale();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeStatus = resolveStatusFilter(resolvedSearchParams?.status);
  const fighterDeleteBlocked = resolvedSearchParams?.fighterDelete === "blocked";
  const eventDeleteBlocked = resolvedSearchParams?.eventDelete === "blocked";
  const tagDeleteBlocked = resolvedSearchParams?.tagDelete === "blocked";
  const aiOnly = isAiOnly(resolvedSearchParams?.aiOnly);
  const sort = resolveSort(resolvedSearchParams?.sort);
  const minConfidence = resolveMinConfidence(resolvedSearchParams?.minConfidence);
  const bulkMessage = getBulkMessage(locale, resolvedSearchParams?.bulkUpdate);
  const [data, options] = await Promise.all([
    getAdminDashboardData({
      status: activeStatus,
      aiOnly,
      minConfidence: minConfidence ? Number(minConfidence) : undefined,
      sort
    }),
    getAdminEditorOptions()
  ]);
  const promotionOptions = options.promotions.map((promotion) => ({ id: promotion.id, label: promotion.shortName }));
  const allowBulkReview = activeStatus === "draft" || activeStatus === "review" || !activeStatus;
  const moderationBaseFilters = { status: activeStatus, aiOnly, minConfidence, sort };
  const aiQueueArticles = data.articles.filter((article) => article.aiConfidence != null).slice(0, 6);
  const currentAdminHref = buildAdminHref(moderationBaseFilters);

  return (
    <main className="container">
      <PageHero
        eyebrow="/admin"
        title={locale === "ru" ? "Админка" : "Admin"}
        description={
          locale === "ru"
            ? "Редакционная панель на Prisma-данных: статьи, AI-черновики, бойцы, турниры, источники и теги."
            : "Editorial dashboard backed by Prisma data for articles, AI drafts, fighters, events, sources, and tags."
        }
      />

      <section className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">{locale === "ru" ? "Статьи" : "Articles"}</p>
          <h3>{data.counts.articles}</h3>
        </article>
        <article className="stat-card">
          <p className="eyebrow">{locale === "ru" ? "Турниры" : "Events"}</p>
          <h3>{data.counts.events}</h3>
        </article>
        <article className="stat-card">
          <p className="eyebrow">{locale === "ru" ? "Бойцы" : "Fighters"}</p>
          <h3>{data.counts.fighters}</h3>
        </article>
      </section>

      <section className="admin-filter-bar">
        <div className="pill-row">
          <Link href={buildAdminHref({ ...moderationBaseFilters, status: undefined })} className={`pill ${activeStatus ? "" : "active"}`}>
            {getStatusLabel(locale, "all")} ({data.counts.articles})
          </Link>
          <Link href={buildAdminHref({ ...moderationBaseFilters, status: "draft" })} className={`pill ${activeStatus === "draft" ? "active" : ""}`}>
            {getStatusLabel(locale, "draft")} ({data.counts.drafts})
          </Link>
          <Link href={buildAdminHref({ ...moderationBaseFilters, status: "review" })} className={`pill ${activeStatus === "review" ? "active" : ""}`}>
            {getStatusLabel(locale, "review")} ({data.counts.review})
          </Link>
          <Link
            href={buildAdminHref({ ...moderationBaseFilters, status: "published" })}
            className={`pill ${activeStatus === "published" ? "active" : ""}`}
          >
            {getStatusLabel(locale, "published")} ({data.counts.published})
          </Link>
        </div>
        <p className="table-note">
          {locale === "ru"
            ? activeStatus
              ? `Показаны материалы со статусом ${activeStatus}.`
              : "Показаны материалы всех статусов."
            : activeStatus
              ? `Showing articles with ${activeStatus} status.`
              : "Showing articles from all statuses."}
        </p>
        {bulkMessage ? <p className="table-note">{bulkMessage}</p> : null}
        {fighterDeleteBlocked ? (
          <p className="table-note">
            {locale === "ru"
              ? "Бойца нельзя удалить, пока он участвует в карточках боёв."
              : "This fighter cannot be deleted while linked to fight cards."}
          </p>
        ) : null}
        {eventDeleteBlocked ? (
          <p className="table-note">
            {locale === "ru"
              ? "Турнир нельзя удалить, пока к нему привязаны бои или статьи."
              : "This event cannot be deleted while linked to fights or articles."}
          </p>
        ) : null}
        {tagDeleteBlocked ? (
          <p className="table-note">
            {locale === "ru"
              ? "Тег нельзя удалить, пока он привязан к статьям."
              : "This tag cannot be deleted while linked to articles."}
          </p>
        ) : null}
      </section>

      <section className="moderation-queue">
        <div className="section-head">
          <div>
            <p className="eyebrow">{locale === "ru" ? "Moderation Queue" : "Moderation queue"}</p>
            <h2>{locale === "ru" ? "Поток AI-черновиков" : "AI draft queue"}</h2>
          </div>
        </div>

        <div className="moderation-stats">
          <article className="mini-card red">
            <p className="eyebrow">{locale === "ru" ? "В очереди" : "In queue"}</p>
            <h3>{data.counts.reviewQueue}</h3>
            <p className="table-note">
              {locale === "ru" ? "Все AI-материалы в draft и review." : "All AI-backed items in draft and review."}
            </p>
          </article>
          <article className="mini-card green">
            <p className="eyebrow">{locale === "ru" ? "Сильные драфты" : "Strong drafts"}</p>
            <h3>{data.counts.highConfidenceDrafts}</h3>
            <p className="table-note">
              {locale === "ru" ? "Draft-статьи с AI score 0.70 и выше." : "Draft articles with AI score 0.70 and above."}
            </p>
          </article>
          <article className="mini-card gold">
            <p className="eyebrow">{locale === "ru" ? "Низкая уверенность" : "Low confidence"}</p>
            <h3>{data.counts.lowConfidenceDrafts}</h3>
            <p className="table-note">
              {locale === "ru" ? "Draft-статьи, которым нужен внимательный review." : "Draft articles that need a careful review."}
            </p>
          </article>
        </div>

        <article className="table-card moderation-controls">
          <div className="moderation-controls-grid">
            <div>
              <h3>{locale === "ru" ? "Быстрые фильтры" : "Quick filters"}</h3>
              <div className="pill-row">
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, aiOnly: false, minConfidence: undefined })}
                  className={`pill ${!aiOnly && !minConfidence ? "active" : ""}`}
                >
                  {locale === "ru" ? "Все статьи" : "All articles"}
                </Link>
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, aiOnly: true, minConfidence: undefined })}
                  className={`pill ${aiOnly && !minConfidence ? "active" : ""}`}
                >
                  {locale === "ru" ? `Только AI (${data.counts.aiDrafts})` : `AI only (${data.counts.aiDrafts})`}
                </Link>
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, aiOnly: true, minConfidence: "0.5" })}
                  className={`pill ${aiOnly && minConfidence === "0.5" ? "active" : ""}`}
                >
                  {locale === "ru" ? "AI score >= 0.50" : "AI score >= 0.50"}
                </Link>
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, aiOnly: true, minConfidence: "0.7" })}
                  className={`pill ${aiOnly && minConfidence === "0.7" ? "active" : ""}`}
                >
                  {locale === "ru" ? "AI score >= 0.70" : "AI score >= 0.70"}
                </Link>
              </div>
            </div>

            <div>
              <h3>{locale === "ru" ? "Сортировка" : "Sort"}</h3>
              <div className="pill-row">
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, sort: "newest" })}
                  className={`pill ${sort === "newest" ? "active" : ""}`}
                >
                  {getSortLabel(locale, "newest")}
                </Link>
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, sort: "aiDesc" })}
                  className={`pill ${sort === "aiDesc" ? "active" : ""}`}
                >
                  {getSortLabel(locale, "aiDesc")}
                </Link>
                <Link
                  href={buildAdminHref({ ...moderationBaseFilters, sort: "aiAsc" })}
                  className={`pill ${sort === "aiAsc" ? "active" : ""}`}
                >
                  {getSortLabel(locale, "aiAsc")}
                </Link>
              </div>
            </div>
          </div>
        </article>

        <article className="table-card">
          <div className="admin-table-head">
            <div>
              <h3>{locale === "ru" ? "Быстрый AI review" : "Quick AI review"}</h3>
              <p className="table-note">
                {locale === "ru"
                  ? "Черновики с AI score, summary и быстрыми кнопками смены статуса."
                  : "AI-backed drafts with score, summary, and quick status actions."}
              </p>
            </div>
          </div>

          {aiQueueArticles.length ? (
            <div className="review-queue-list">
              {aiQueueArticles.map((article) => (
                <article key={article.id} className="review-queue-item">
                  <div className="review-queue-top">
                    <div className="review-queue-copy">
                      <p className="eyebrow">
                        {article.status} · {article.promotion?.shortName ?? "FightBase"} · {formatDate(article.publishedAt, locale)}
                      </p>
                      <h4>{article.title}</h4>
                    </div>
                    <span className={`score-pill ${getScoreTone(article.aiConfidence)}`}>
                      {article.aiConfidence != null ? article.aiConfidence.toFixed(2) : "-"}
                    </span>
                  </div>

                  <p className="copy">{article.excerpt}</p>

                  {article.ingestionSourceSummary ? (
                    <div className="review-note">
                      <strong>{locale === "ru" ? "Source summary:" : "Source summary:"}</strong> {article.ingestionSourceSummary}
                    </div>
                  ) : null}

                  {article.ingestionNotes ? (
                    <div className="review-note">
                      <strong>{locale === "ru" ? "Moderation notes:" : "Moderation notes:"}</strong> {article.ingestionNotes}
                    </div>
                  ) : null}

                  <div className="review-queue-actions">
                    {article.status !== "review" ? (
                      <form action={quickUpdateArticleStatusAction}>
                        <input type="hidden" name="articleId" value={article.id} />
                        <input type="hidden" name="targetStatus" value="review" />
                        <input type="hidden" name="returnTo" value={currentAdminHref} />
                        <button type="submit" className="button-secondary">
                          {locale === "ru" ? "В review" : "To review"}
                        </button>
                      </form>
                    ) : null}

                    {article.status !== "published" ? (
                      <form action={quickUpdateArticleStatusAction}>
                        <input type="hidden" name="articleId" value={article.id} />
                        <input type="hidden" name="targetStatus" value="published" />
                        <input type="hidden" name="returnTo" value={currentAdminHref} />
                        <button type="submit" className="button">
                          {locale === "ru" ? "Опубликовать" : "Publish"}
                        </button>
                      </form>
                    ) : null}

                    {article.status !== "draft" ? (
                      <form action={quickUpdateArticleStatusAction}>
                        <input type="hidden" name="articleId" value={article.id} />
                        <input type="hidden" name="targetStatus" value="draft" />
                        <input type="hidden" name="returnTo" value={currentAdminHref} />
                        <button type="submit" className="button-ghost">
                          {locale === "ru" ? "Вернуть в draft" : "Move to draft"}
                        </button>
                      </form>
                    ) : null}

                    <Link href={`/admin/articles/${article.id}`} className="button-ghost">
                      {locale === "ru" ? "Открыть статью" : "Open article"}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="table-note">
              {locale === "ru"
                ? "В текущем фильтре нет AI-материалов для быстрой модерации."
                : "No AI-backed items in the current filter."}
            </p>
          )}
        </article>
      </section>

      <section className="detail-grid" style={{ marginTop: 24 }}>
        <div className="stack">
          <AdminIngestForm locale={locale} />

          <AdminArticleForm
            locale={locale}
            promotions={promotionOptions}
            events={options.events.map((event) => ({ id: event.id, label: event.name }))}
            fighters={options.fighters.map((fighter) => ({ id: fighter.id, label: fighter.name }))}
            tags={options.tags.map((tag) => ({ id: tag.id, label: tag.label }))}
            sources={options.sources.map((source) => ({ id: source.id, label: source.label }))}
          />

          <AdminSourceForm locale={locale} />

          <AdminTagForm locale={locale} />

          <AdminFighterForm locale={locale} promotions={promotionOptions} />

          <AdminEventForm locale={locale} promotions={promotionOptions} />

          <article className="table-card">
            <div className="admin-table-head">
              <div>
                <h3>{locale === "ru" ? "Список статей" : "Article list"}</h3>
                <p className="table-note">
                  {locale === "ru"
                    ? "Для batch-review выдели нужные статьи и переведи их в review или сразу publish."
                    : "Select articles to move them to review or publish in bulk."}
                </p>
              </div>
              {allowBulkReview ? (
                <div className="admin-bulk-actions">
                  <button type="submit" form="bulk-review-form" name="targetStatus" value="review" className="button-secondary">
                    {locale === "ru" ? "В review" : "To review"}
                  </button>
                  <button type="submit" form="bulk-review-form" name="targetStatus" value="published" className="button">
                    {locale === "ru" ? "Опубликовать" : "Publish"}
                  </button>
                </div>
              ) : null}
            </div>
            <form id="bulk-review-form" action={bulkUpdateArticleStatusAction}>
              <input type="hidden" name="currentStatus" value={activeStatus ?? ""} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{locale === "ru" ? "Выбор" : "Select"}</th>
                      <th>{locale === "ru" ? "Заголовок" : "Title"}</th>
                      <th>{locale === "ru" ? "Категория" : "Category"}</th>
                      <th>{locale === "ru" ? "Статус" : "Status"}</th>
                      <th>AI score</th>
                      <th>{locale === "ru" ? "Промоушен" : "Promotion"}</th>
                      <th>{locale === "ru" ? "Дата" : "Published"}</th>
                      <th>{locale === "ru" ? "Действие" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.articles.map((article) => (
                      <tr key={article.id}>
                        <td>
                          <input
                            type="checkbox"
                            name="articleIds"
                            value={article.id}
                            disabled={article.status === "published" && activeStatus === "published"}
                          />
                        </td>
                        <td>{article.title}</td>
                        <td>{article.category}</td>
                        <td>{article.status}</td>
                        <td>
                          <span className={`score-pill ${getScoreTone(article.aiConfidence)}`}>
                            {article.aiConfidence != null ? article.aiConfidence.toFixed(2) : "-"}
                          </span>
                        </td>
                        <td>{article.promotion?.shortName ?? "-"}</td>
                        <td>{formatDate(article.publishedAt, locale)}</td>
                        <td>
                          <Link href={`/admin/articles/${article.id}`}>{locale === "ru" ? "Редактировать" : "Edit"}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </form>
          </article>
        </div>

        <aside className="stack">
          <article className="policy-card">
            <h3>{locale === "ru" ? "Что уже умеет админка" : "What admin can do now"}</h3>
            <ul>
              <li>{locale === "ru" ? "Создавать статьи в базе" : "Create articles in the database"}</li>
              <li>{locale === "ru" ? "Импортировать AI-черновики в draft" : "Ingest AI drafts into draft status"}</li>
              <li>{locale === "ru" ? "Хранить AI score, сводку ingestion и заметки модерации" : "Store AI score, ingestion summary, and moderation notes"}</li>
              <li>{locale === "ru" ? "Массово переводить статьи в review или published" : "Move articles to review or published in bulk"}</li>
              <li>{locale === "ru" ? "Фильтровать AI-поток по confidence и сортировать по score" : "Filter AI queue by confidence and sort by score"}</li>
              <li>{locale === "ru" ? "Редактировать бойцов, турниры, источники и теги" : "Edit fighters, events, sources, and tags"}</li>
            </ul>
          </article>

          <article className="policy-card">
            <h3>{locale === "ru" ? "Турниры" : "Events"}</h3>
            <ul>
              {data.events.map((event) => (
                <li key={event.id}>
                  <Link href={`/admin/events/${event.id}`}>
                    {event.name} - {event.promotion.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </article>

          <article className="policy-card">
            <h3>{locale === "ru" ? "Бойцы" : "Fighters"}</h3>
            <ul>
              {data.fighters.map((fighter) => (
                <li key={fighter.id}>
                  <Link href={`/admin/fighters/${fighter.id}`}>
                    {fighter.name} - {fighter.promotion.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </article>

          <article className="policy-card">
            <h3>{locale === "ru" ? "Теги" : "Tags"}</h3>
            <ul>
              {options.tags.map((tag) => (
                <li key={tag.id}>
                  <Link href={`/admin/tags/${tag.id}`}>{tag.label}</Link>
                </li>
              ))}
            </ul>
          </article>

          <article className="policy-card">
            <h3>{locale === "ru" ? "Источники" : "Sources"}</h3>
            <ul>
              {data.sources.map((source) => (
                <li key={source.id}>
                  <Link href={`/admin/sources/${source.id}`}>{source.label}</Link>
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </section>
    </main>
  );
}
