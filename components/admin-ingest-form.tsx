import { ingestDraftArticleAction } from "@/app/admin/actions";

export function AdminIngestForm({ locale }: { locale: "ru" | "en" }) {
  return (
    <article className="policy-card">
      <h3>{locale === "ru" ? "AI-импорт в черновик" : "AI draft ingestion"}</h3>
      <p>
        {locale === "ru"
          ? "Вставь заголовок, текст источника и ссылку. Система создаст черновик статьи и попытается автоматически определить бойцов, турнир и теги."
          : "Paste a headline, source text, and source URL. The system will create a draft article and infer fighters, event, and tags where possible."}
      </p>

      <form action={ingestDraftArticleAction} className="admin-form">
        <label className="admin-field">
          <span>{locale === "ru" ? "Заголовок" : "Headline"}</span>
          <input name="headline" required />
        </label>

        <label className="admin-field">
          <span>{locale === "ru" ? "Текст источника" : "Source body"}</span>
          <textarea name="body" rows={8} required />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Источник" : "Source label"}</span>
            <input name="sourceLabel" placeholder="UFC" required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "URL источника" : "Source URL"}</span>
            <input name="sourceUrl" type="url" placeholder="https://ufc.com/news/..." required />
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Категория" : "Category"}</span>
            <select name="category" defaultValue="news">
              <option value="news">news</option>
              <option value="analysis">analysis</option>
              <option value="interview">interview</option>
              <option value="feature">feature</option>
              <option value="video">video</option>
            </select>
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Дата материала" : "Published at"}</span>
            <input
              type="datetime-local"
              name="publishedAt"
              defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            />
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Бойцы (slug через запятую)" : "Fighters (slug list)"}</span>
            <input name="fighterSlugs" placeholder="alex-pereira, magomed-ankalaev" />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Теги (slug через запятую)" : "Tags (slug list)"}</span>
            <input name="tagSlugs" placeholder="ufc, title-fight" />
          </label>
        </div>

        <div className="admin-actions">
          <button type="submit" className="button">
            {locale === "ru" ? "Создать черновик" : "Create draft"}
          </button>
        </div>
      </form>
    </article>
  );
}
