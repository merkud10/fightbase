import { enqueueBackgroundJobAction, ingestDraftArticleAction } from "@/app/admin/actions";

export function AdminIngestForm({
  locale,
  currentAdminHref
}: {
  locale: "ru" | "en";
  currentAdminHref: string;
}) {
  return (
    <>
      <article className="policy-card">
        <h3>{locale === "ru" ? "Быстрые задачи очереди" : "Queue quick actions"}</h3>
        <p>
          {locale === "ru"
            ? "Поставь в очередь основные фоновые задачи редакции: загрузку watchlist, AI-discovery, аналитику и полный sync турниров, коэффициентов и прогнозов."
            : "Queue the main editorial background jobs: watchlist ingestion, AI discovery, analysis ingestion, and the full events, odds, and predictions sync."}
        </p>

        <div className="admin-subscription-list">
          <article className="admin-subscription-item">
            <div className="admin-subscription-copy">
              <strong>{locale === "ru" ? "Watchlist ingest" : "Watchlist ingest"}</strong>
              <p className="table-note">
                {locale === "ru"
                  ? "Подтянуть материалы из watchlist-файла и провести их через основной ingestion-контур."
                  : "Pull items from the watchlist file and run them through the main ingestion flow."}
              </p>
            </div>
            <form action={enqueueBackgroundJobAction}>
              <input type="hidden" name="returnTo" value={currentAdminHref} />
              <input type="hidden" name="jobType" value="watchlist" />
              <input type="hidden" name="file" value="ingestion/sample-watchlist.json" />
              <input type="hidden" name="priority" value="90" />
              <button type="submit" className="button-secondary">
                {locale === "ru" ? "Поставить в очередь" : "Queue job"}
              </button>
            </form>
          </article>

          <article className="admin-subscription-item">
            <div className="admin-subscription-copy">
              <strong>{locale === "ru" ? "AI-discovery новостей" : "AI news discovery"}</strong>
              <p className="table-note">
                {locale === "ru"
                  ? "Найти и обработать свежие UFC/MMA материалы через AI-классификацию и DeepSeek."
                  : "Find and process fresh UFC or MMA stories through AI classification and DeepSeek."}
              </p>
            </div>
            <form action={enqueueBackgroundJobAction}>
              <input type="hidden" name="returnTo" value={currentAdminHref} />
              <input type="hidden" name="jobType" value="ai-discovery" />
              <input type="hidden" name="priority" value="70" />
              <input type="hidden" name="lookbackHours" value="72" />
              <input type="hidden" name="limit" value="12" />
              <button type="submit" className="button-secondary">
                {locale === "ru" ? "Запланировать" : "Schedule"}
              </button>
            </form>
          </article>

          <article className="admin-subscription-item">
            <div className="admin-subscription-copy">
              <strong>{locale === "ru" ? "Аналитика недели" : "Weekly analysis"}</strong>
              <p className="table-note">
                {locale === "ru"
                  ? "Запустить discovery и repair-контур для long-form аналитики и превью боев."
                  : "Run discovery and repair for long-form analysis and fight previews."}
              </p>
            </div>
            <form action={enqueueBackgroundJobAction}>
              <input type="hidden" name="returnTo" value={currentAdminHref} />
              <input type="hidden" name="jobType" value="weekly-analysis" />
              <input type="hidden" name="priority" value="80" />
              <input type="hidden" name="limit" value="6" />
              <button type="submit" className="button-secondary">
                {locale === "ru" ? "Поставить в очередь" : "Queue job"}
              </button>
            </form>
          </article>

          <article className="admin-subscription-item">
            <div className="admin-subscription-copy">
              <strong>{locale === "ru" ? "Odds и прогнозы" : "Odds and predictions"}</strong>
              <p className="table-note">
                {locale === "ru"
                  ? "Пересинхронизировать турниры, кард, коэффициенты и prediction snapshots."
                  : "Resync events, fight cards, odds, and prediction snapshots."}
              </p>
            </div>
            <form action={enqueueBackgroundJobAction}>
              <input type="hidden" name="returnTo" value={currentAdminHref} />
              <input type="hidden" name="jobType" value="sync-odds" />
              <input type="hidden" name="priority" value="25" />
              <button type="submit" className="button">
                {locale === "ru" ? "Запустить sync" : "Run sync"}
              </button>
            </form>
          </article>
        </div>
      </article>

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
    </>
  );
}
