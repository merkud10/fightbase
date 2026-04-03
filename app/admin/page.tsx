import type { ArticleStatus } from "@prisma/client";

import { PageHero } from "@/components/page-hero";
import { AdminWorkspace } from "@/components/admin-workspace";
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
  socialPost?: string | string[];
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

function getSocialPostMessage(locale: "ru" | "en", value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const [target, status, encodedMessage] = value.split(":");
  const label =
    target === "telegram"
      ? "Telegram"
      : target === "vk"
        ? "VK"
        : null;

  if (!label) {
    return null;
  }

  if (status === "success") {
    return locale === "ru" ? `Материал отправлен в ${label}.` : `Article sent to ${label}.`;
  }

  if (status === "error") {
    const message = encodedMessage ? decodeURIComponent(encodedMessage) : locale === "ru" ? "Неизвестная ошибка." : "Unknown error.";
    return locale === "ru" ? `${label}: ${message}` : `${label}: ${message}`;
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
  const socialPostMessage = getSocialPostMessage(locale, resolvedSearchParams?.socialPost);
  const [data, options] = await Promise.all([
    getAdminDashboardData({
      status: activeStatus,
      aiOnly,
      minConfidence: minConfidence ? Number(minConfidence) : undefined,
      sort
    }),
    getAdminEditorOptions()
  ]);
  const allowBulkReview = activeStatus === "draft" || activeStatus === "review" || !activeStatus;
  const moderationBaseFilters = { status: activeStatus, aiOnly, minConfidence, sort };
  const aiQueueArticles = data.articles.filter((article) => article.aiConfidence != null).slice(0, 6);
  const currentAdminHref = buildAdminHref(moderationBaseFilters);

  return (
    <main className="container">
      <PageHero
        eyebrow="/admin"
        title={locale === "ru" ? "Редакционная панель" : "Editorial dashboard"}
        description={
          locale === "ru"
            ? "Управление материалами, AI-черновиками и справочниками редакции в одной панели."
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
        <article className="stat-card">
          <p className="eyebrow">{locale === "ru" ? "Push-подписки" : "Push subscriptions"}</p>
          <h3>{data.counts.activeBrowserPushSubscriptions}</h3>
        </article>
      </section>

      <section className="admin-filter-bar">
        <div className="pill-row">
          <a href={buildAdminHref({ ...moderationBaseFilters, status: undefined })} className={`pill ${activeStatus ? "" : "active"}`}>
            {getStatusLabel(locale, "all")} ({data.counts.articles})
          </a>
          <a href={buildAdminHref({ ...moderationBaseFilters, status: "draft" })} className={`pill ${activeStatus === "draft" ? "active" : ""}`}>
            {getStatusLabel(locale, "draft")} ({data.counts.drafts})
          </a>
          <a href={buildAdminHref({ ...moderationBaseFilters, status: "review" })} className={`pill ${activeStatus === "review" ? "active" : ""}`}>
            {getStatusLabel(locale, "review")} ({data.counts.review})
          </a>
          <a
            href={buildAdminHref({ ...moderationBaseFilters, status: "published" })}
            className={`pill ${activeStatus === "published" ? "active" : ""}`}
          >
            {getStatusLabel(locale, "published")} ({data.counts.published})
          </a>
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
        {socialPostMessage ? <p className="table-note">{socialPostMessage}</p> : null}
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

      <AdminWorkspace
        locale={locale}
        data={data}
        options={options}
        activeStatus={activeStatus}
        aiOnly={aiOnly}
        minConfidence={minConfidence}
        sort={sort}
        allowBulkReview={allowBulkReview}
        aiQueueArticles={aiQueueArticles}
        currentAdminHref={currentAdminHref}
        buildAdminHref={buildAdminHref}
        getSortLabel={getSortLabel}
      />
    </main>
  );
}
