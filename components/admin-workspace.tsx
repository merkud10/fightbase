import Link from "next/link";

import {
  bulkUpdateArticleStatusAction,
  deactivateBrowserPushSubscriptionAction,
  publishArticleToTelegramAction,
  publishArticleToVkAction,
  quickUpdateArticleStatusAction
} from "@/app/admin/actions";
import { AdminArticleForm } from "@/components/admin-article-form";
import { AdminEventForm } from "@/components/admin-event-form";
import { AdminFighterForm } from "@/components/admin-fighter-form";
import { AdminIngestForm } from "@/components/admin-ingest-form";
import { AdminSourceForm } from "@/components/admin-source-form";
import { AdminTabs } from "@/components/admin-tabs";
import { AdminTagForm } from "@/components/admin-tag-form";

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

function formatRunStatus(locale: "ru" | "en", status: "running" | "success" | "partial" | "failed" | "dry_run") {
  if (locale === "ru") {
    switch (status) {
      case "running":
        return "Выполняется";
      case "success":
        return "Успешно";
      case "partial":
        return "Частично";
      case "failed":
        return "Ошибка";
      case "dry_run":
        return "Dry run";
    }
  }

  switch (status) {
    case "running":
      return "Running";
    case "success":
      return "Success";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "dry_run":
      return "Dry run";
  }
}

function truncateValue(value: string, max = 52) {
  const clean = String(value || "").trim();
  if (clean.length <= max) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, max - 1))}…`;
}

function describeUserAgent(userAgent: string | null | undefined) {
  const value = String(userAgent || "");

  if (!value) {
    return "Unknown browser";
  }

  if (/Edg\//i.test(value)) {
    return "Microsoft Edge";
  }

  if (/Chrome\//i.test(value) && !/Edg\//i.test(value)) {
    return "Google Chrome";
  }

  if (/Firefox\//i.test(value)) {
    return "Mozilla Firefox";
  }

  if (/Safari\//i.test(value) && !/Chrome\//i.test(value)) {
    return "Safari";
  }

  if (/OPR\//i.test(value) || /Opera/i.test(value)) {
    return "Opera";
  }

  return "Browser";
}

export function AdminWorkspace({
  locale,
  data,
  options,
  activeStatus,
  aiOnly,
  minConfidence,
  sort,
  allowBulkReview,
  aiQueueArticles,
  currentAdminHref,
  buildAdminHref,
  getSortLabel
}: {
  locale: "ru" | "en";
  data: any;
  options: any;
  activeStatus: string | undefined;
  aiOnly: boolean;
  minConfidence: string | undefined;
  sort: "newest" | "aiDesc" | "aiAsc";
  allowBulkReview: boolean;
  aiQueueArticles: any[];
  currentAdminHref: string;
  buildAdminHref: (filters: { status?: any; aiOnly?: boolean; minConfidence?: string; sort?: "newest" | "aiDesc" | "aiAsc" }) => string;
  getSortLabel: (locale: "ru" | "en", sort: "newest" | "aiDesc" | "aiAsc") => string;
}) {
  const promotionOptions = options.promotions.map((promotion: any) => ({ id: promotion.id, label: promotion.shortName }));
  const moderationBaseFilters = { status: activeStatus, aiOnly, minConfidence, sort };

  return (
    <section className="admin-layout">
      <div className="admin-main">
        <AdminTabs
          initialTabId="moderation"
          items={[
            {
              id: "moderation",
              label: locale === "ru" ? "Модерация" : "Moderation",
              note: locale === "ru" ? "Очередь и публикация" : "Queue and publishing",
              content: (
                <div className="admin-tab-stack">
                  <section className="moderation-queue admin-tab-section">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">{locale === "ru" ? "Модерация" : "Moderation"}</p>
                        <h2>{locale === "ru" ? "Очередь AI-черновиков" : "AI draft queue"}</h2>
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
                          <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
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
                              AI score &gt;= 0.50
                            </Link>
                            <Link
                              href={buildAdminHref({ ...moderationBaseFilters, aiOnly: true, minConfidence: "0.7" })}
                              className={`pill ${aiOnly && minConfidence === "0.7" ? "active" : ""}`}
                            >
                              AI score &gt;= 0.70
                            </Link>
                          </div>
                        </div>

                        <div>
                          <h3>{locale === "ru" ? "Порядок" : "Sort"}</h3>
                          <div className="pill-row">
                            <Link href={buildAdminHref({ ...moderationBaseFilters, sort: "newest" })} className={`pill ${sort === "newest" ? "active" : ""}`}>
                              {getSortLabel(locale, "newest")}
                            </Link>
                            <Link href={buildAdminHref({ ...moderationBaseFilters, sort: "aiDesc" })} className={`pill ${sort === "aiDesc" ? "active" : ""}`}>
                              {getSortLabel(locale, "aiDesc")}
                            </Link>
                            <Link href={buildAdminHref({ ...moderationBaseFilters, sort: "aiAsc" })} className={`pill ${sort === "aiAsc" ? "active" : ""}`}>
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
                                  <strong>{locale === "ru" ? "Сводка источника:" : "Source summary:"}</strong> {article.ingestionSourceSummary}
                                </div>
                              ) : null}

                              {article.ingestionNotes ? (
                                <div className="review-note">
                                  <strong>{locale === "ru" ? "Заметки модерации:" : "Moderation notes:"}</strong> {article.ingestionNotes}
                                </div>
                              ) : null}

                              <div className="review-queue-actions">
                                {article.status !== "review" ? (
                                  <form action={quickUpdateArticleStatusAction}>
                                    <input type="hidden" name="articleId" value={article.id} />
                                    <input type="hidden" name="targetStatus" value="review" />
                                    <input type="hidden" name="returnTo" value={currentAdminHref} />
                                    <button type="submit" className="button-secondary">
                                      {locale === "ru" ? "На проверку" : "To review"}
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
                                      {locale === "ru" ? "Вернуть в черновик" : "Move to draft"}
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

                    <article className="table-card">
                      <div className="admin-table-head">
                        <div>
                          <p className="admin-kicker">{locale === "ru" ? "Материалы" : "Articles"}</p>
                          <h3>{locale === "ru" ? "Список статей" : "Article list"}</h3>
                          <p className="table-note">
                            {locale === "ru"
                              ? "Выдели нужные материалы и переведи их на проверку или в публикацию."
                              : "Select articles to move them to review or publish in bulk."}
                          </p>
                        </div>
                        {allowBulkReview ? (
                          <div className="admin-bulk-actions">
                            <button type="submit" form="bulk-review-form" name="targetStatus" value="review" className="button-secondary">
                              {locale === "ru" ? "На проверку" : "To review"}
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
                              {data.articles.map((article: any) => (
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
                                    <div className="admin-inline-actions">
                                      <Link href={`/admin/articles/${article.id}`}>{locale === "ru" ? "Редактировать" : "Edit"}</Link>
                                      {article.category === "news" && article.status === "published" ? (
                                        <>
                                          <form action={publishArticleToVkAction}>
                                            <input type="hidden" name="articleId" value={article.id} />
                                            <input type="hidden" name="returnTo" value={currentAdminHref} />
                                            <button
                                              type="submit"
                                              className="button-ghost admin-inline-button"
                                              disabled={Boolean(article.vkPostedAt)}
                                            >
                                              {article.vkPostedAt
                                                ? locale === "ru"
                                                  ? "ВК: отправлено"
                                                  : "VK: sent"
                                                : locale === "ru"
                                                  ? "Отправить в ВК"
                                                  : "Send to VK"}
                                            </button>
                                          </form>
                                          <form action={publishArticleToTelegramAction}>
                                            <input type="hidden" name="articleId" value={article.id} />
                                            <input type="hidden" name="returnTo" value={currentAdminHref} />
                                            <button
                                              type="submit"
                                              className="button-ghost admin-inline-button"
                                              disabled={Boolean(article.telegramPostedAt)}
                                            >
                                              {article.telegramPostedAt
                                                ? locale === "ru"
                                                  ? "ТГ: отправлено"
                                                  : "TG: sent"
                                                : locale === "ru"
                                                  ? "Отправить в ТГ"
                                                  : "Send to TG"}
                                            </button>
                                          </form>
                                        </>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </form>
                    </article>
                  </section>
                </div>
              )
            },
            {
              id: "content",
              label: locale === "ru" ? "Материалы" : "Content",
              note: locale === "ru" ? "Импорт и создание" : "Import and draft",
              content: (
                <section className="admin-section admin-tab-section">
                  <div className="admin-section-head">
                    <div>
                      <p className="admin-kicker">{locale === "ru" ? "Создание" : "Create"}</p>
                      <h2>{locale === "ru" ? "Материалы" : "Content"}</h2>
                      <p className="table-note">
                        {locale === "ru"
                          ? "Основные действия редактора: импорт, создание и ручное редактирование статьи."
                          : "Core editorial actions for importing, drafting, and editing articles."}
                      </p>
                    </div>
                  </div>
                  <div className="admin-form-cluster">
                    <AdminIngestForm locale={locale} />
                    <AdminArticleForm
                      locale={locale}
                      promotions={promotionOptions}
                      events={options.events.map((event: any) => ({ id: event.id, label: event.name }))}
                      fighters={options.fighters.map((fighter: any) => ({ id: fighter.id, label: fighter.name }))}
                      tags={options.tags.map((tag: any) => ({ id: tag.id, label: tag.label }))}
                      sources={options.sources.map((source: any) => ({ id: source.id, label: source.label }))}
                    />
                  </div>
                  <article className="table-card admin-subscriptions-card">
                    <div className="admin-table-head">
                      <div>
                        <p className="admin-kicker">{locale === "ru" ? "Push" : "Push"}</p>
                        <h3>{locale === "ru" ? "Браузерные подписки" : "Browser subscriptions"}</h3>
                        <p className="table-note">
                          {locale === "ru"
                            ? `Активных подписок: ${data.counts.activeBrowserPushSubscriptions} из ${data.counts.browserPushSubscriptions}.`
                            : `Active subscriptions: ${data.counts.activeBrowserPushSubscriptions} of ${data.counts.browserPushSubscriptions}.`}
                        </p>
                      </div>
                    </div>
                    {data.browserPushSubscriptions.length ? (
                      <div className="admin-subscription-list">
                        {data.browserPushSubscriptions.map((subscription: any) => (
                          <article key={subscription.id} className="admin-subscription-item">
                            <div className="admin-subscription-copy">
                              <div className="admin-subscription-top">
                                <span className={`status-pill ${subscription.isActive ? "published" : "draft"}`}>
                                  {subscription.isActive
                                    ? locale === "ru"
                                      ? "Активна"
                                      : "Active"
                                    : locale === "ru"
                                      ? "Отключена"
                                      : "Inactive"}
                                </span>
                                <span className="table-note">
                                  {describeUserAgent(subscription.userAgent)} · {String(subscription.locale || "ru").toUpperCase()}
                                </span>
                              </div>
                              <strong>{truncateValue(subscription.endpoint, 78)}</strong>
                              <p className="table-note">
                                {locale === "ru"
                                  ? `Подписка: ${formatDate(subscription.createdAt, locale)} · Последняя активность: ${formatDate(subscription.lastSeenAt, locale)}`
                                  : `Subscribed: ${formatDate(subscription.createdAt, locale)} · Last seen: ${formatDate(subscription.lastSeenAt, locale)}`}
                              </p>
                            </div>
                            {subscription.isActive ? (
                              <form action={deactivateBrowserPushSubscriptionAction}>
                                <input type="hidden" name="subscriptionId" value={subscription.id} />
                                <input type="hidden" name="returnTo" value="/admin" />
                                <button type="submit" className="button-ghost">
                                  {locale === "ru" ? "Отключить" : "Deactivate"}
                                </button>
                              </form>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="table-note">
                        {locale === "ru"
                          ? "Пока нет ни одной сохраненной browser push-подписки."
                          : "There are no saved browser push subscriptions yet."}
                      </p>
                    )}
                  </article>
                </section>
              )
            },
            {
              id: "reference",
              label: locale === "ru" ? "Справочники" : "Reference",
              note: locale === "ru" ? "Бойцы, теги, турниры" : "Fighters, tags, events",
              content: (
                <section className="admin-section admin-tab-section">
                  <div className="admin-section-head">
                    <div>
                      <p className="admin-kicker">{locale === "ru" ? "Справочники" : "Reference data"}</p>
                      <h2>{locale === "ru" ? "Сущности редакции" : "Editorial entities"}</h2>
                      <p className="table-note">
                        {locale === "ru"
                          ? "Источники, теги, бойцы и турниры открываются отдельно, когда они действительно нужны."
                          : "Sources, tags, fighters, and events live in a dedicated workspace."}
                      </p>
                    </div>
                  </div>
                  <div className="admin-form-cluster admin-form-cluster--compact">
                    <AdminSourceForm locale={locale} />
                    <AdminTagForm locale={locale} />
                    <AdminFighterForm locale={locale} promotions={promotionOptions} />
                    <AdminEventForm locale={locale} promotions={promotionOptions} />
                  </div>
                </section>
              )
            }
          ]}
        />
      </div>
    </section>
  );
}
