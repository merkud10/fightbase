import { createArticleAction, deleteArticleAction, updateArticleAction } from "@/app/admin/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { SearchableMultiSelect } from "@/components/searchable-multi-select";

type Option = {
  id: string;
  label: string;
};

type SelectOption = {
  id: string;
  label: string;
};

type ArticleDraft = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  meaning: string;
  category: string;
  status: string;
  aiConfidence: number | null;
  ingestionSourceSummary: string | null;
  ingestionNotes: string | null;
  publishedAt: Date;
  promotionId: string | null;
  eventId: string | null;
  sections: Array<{ body: string }>;
  tagMap: Array<{ tagId: string }>;
  fighterMap: Array<{ fighterId: string }>;
  sourceMap: Array<{ sourceId: string }>;
};

export function AdminArticleForm({
  locale,
  promotions,
  events,
  fighters,
  tags,
  sources,
  article
}: {
  locale: "ru" | "en";
  promotions: SelectOption[];
  events: SelectOption[];
  fighters: Option[];
  tags: Option[];
  sources: Option[];
  article?: ArticleDraft | null;
}) {
  const isEdit = Boolean(article);
  const selectedTagIds = new Set(article?.tagMap.map((item) => item.tagId) ?? []);
  const selectedFighterIds = new Set(article?.fighterMap.map((item) => item.fighterId) ?? []);
  const selectedSourceIds = new Set(article?.sourceMap.map((item) => item.sourceId) ?? []);
  const formAction = isEdit ? updateArticleAction.bind(null, article!.id) : createArticleAction;

  return (
    <article className="policy-card">
      <h3>{locale === "ru" ? (isEdit ? "Редактировать статью" : "Новая статья") : isEdit ? "Edit article" : "New article"}</h3>
      <form action={formAction} className="admin-form">
        <label className="admin-field">
          <span>{locale === "ru" ? "Заголовок" : "Title"}</span>
          <input name="title" defaultValue={article?.title ?? ""} required />
        </label>

        <label className="admin-field">
          <span>Slug</span>
          <input name="slug" defaultValue={article?.slug ?? ""} placeholder="auto-from-title" />
        </label>

        <label className="admin-field">
          <span>{locale === "ru" ? "Краткий лид" : "Excerpt"}</span>
          <textarea name="excerpt" defaultValue={article?.excerpt ?? ""} rows={3} required />
        </label>

        <label className="admin-field">
          <span>{locale === "ru" ? "Что это значит" : "Meaning block"}</span>
          <textarea name="meaning" defaultValue={article?.meaning ?? ""} rows={3} required />
        </label>

        <label className="admin-field">
          <span>{locale === "ru" ? "Основной текст" : "Body"}</span>
          <textarea name="body" defaultValue={article?.sections[0]?.body ?? ""} rows={8} required />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Категория" : "Category"}</span>
            <select name="category" defaultValue={article?.category ?? "news"}>
              <option value="news">news</option>
              <option value="analysis">analysis</option>
              <option value="interview">interview</option>
              <option value="feature">feature</option>
              <option value="video">video</option>
            </select>
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Статус" : "Status"}</span>
            <select name="status" defaultValue={article?.status ?? "draft"}>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="published">published</option>
            </select>
          </label>
        </div>

        <label className="admin-field">
          <span>{locale === "ru" ? "Дата публикации" : "Published at"}</span>
          <input
            type="datetime-local"
            name="publishedAt"
            defaultValue={
              article?.publishedAt
                ? new Date(article.publishedAt.getTime() - article.publishedAt.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16)
                : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
            }
            required
          />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Уверенность AI" : "AI confidence"}</span>
            <input
              type="number"
              name="aiConfidence"
              min="0"
              max="1"
              step="0.01"
              defaultValue={article?.aiConfidence ?? ""}
              placeholder="0.00 - 1.00"
            />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Режим модерации" : "Moderation mode"}</span>
            <input
              value={
                locale === "ru"
                  ? article?.aiConfidence != null
                    ? "AI-черновик"
                    : "Ручной материал"
                  : article?.aiConfidence != null
                    ? "AI-assisted draft"
                    : "Manual article"
              }
              readOnly
            />
          </label>
        </div>

        <label className="admin-field">
          <span>{locale === "ru" ? "Сводка источника" : "Ingestion summary"}</span>
          <textarea name="ingestionSourceSummary" defaultValue={article?.ingestionSourceSummary ?? ""} rows={3} />
        </label>

        <label className="admin-field">
          <span>{locale === "ru" ? "Заметки модерации" : "Moderation notes"}</span>
          <textarea name="ingestionNotes" defaultValue={article?.ingestionNotes ?? ""} rows={4} />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Промоушен" : "Promotion"}</span>
            <select name="promotionId" defaultValue={article?.promotionId ?? ""}>
              <option value="">{locale === "ru" ? "Не выбран" : "None"}</option>
              {promotions.map((promotion) => (
                <option key={promotion.id} value={promotion.id}>
                  {promotion.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Турнир" : "Event"}</span>
            <select name="eventId" defaultValue={article?.eventId ?? ""}>
              <option value="">{locale === "ru" ? "Не выбран" : "None"}</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="admin-grid">
          <SearchableMultiSelect
            name="tagIds"
            label={locale === "ru" ? "Теги" : "Tags"}
            options={tags}
            defaultValue={Array.from(selectedTagIds)}
            searchPlaceholder={locale === "ru" ? "Поиск тегов" : "Search tags"}
            helperText={locale === "ru" ? "Теги не выбраны" : "No tags selected"}
            emptyText={locale === "ru" ? "Теги не найдены" : "No tags found"}
          />

          <SearchableMultiSelect
            name="fighterIds"
            label={locale === "ru" ? "Бойцы" : "Fighters"}
            options={fighters}
            defaultValue={Array.from(selectedFighterIds)}
            searchPlaceholder={locale === "ru" ? "Поиск бойцов" : "Search fighters"}
            helperText={locale === "ru" ? "Бойцы не выбраны" : "No fighters selected"}
            emptyText={locale === "ru" ? "Бойцы не найдены" : "No fighters found"}
          />
        </div>

        <SearchableMultiSelect
          name="sourceIds"
          label={locale === "ru" ? "Источники" : "Sources"}
          options={sources}
          defaultValue={Array.from(selectedSourceIds)}
          searchPlaceholder={locale === "ru" ? "Поиск источников" : "Search sources"}
          helperText={locale === "ru" ? "Источники не выбраны" : "No sources selected"}
          emptyText={locale === "ru" ? "Источники не найдены" : "No sources found"}
        />

        <div className="admin-actions">
          <button type="submit" className="button">
            {locale === "ru" ? (isEdit ? "Сохранить" : "Создать статью") : isEdit ? "Save" : "Create article"}
          </button>
        </div>
      </form>
      {isEdit ? (
        <form action={deleteArticleAction}>
          <input type="hidden" name="articleId" value={article!.id} />
          <ConfirmDeleteButton
            label={locale === "ru" ? "Удалить" : "Delete"}
            confirmMessage={locale === "ru" ? "Удалить? Это действие необратимо." : "Delete? This action is irreversible."}
          />
        </form>
      ) : null}
    </article>
  );
}
