import {
  createSourceAction,
  deleteSourceAction,
  updateSourceAction
} from "@/app/admin/actions";

type SourceDraft = {
  id: string;
  slug: string;
  label: string;
  type: string;
  url: string;
};

export function AdminSourceForm({
  locale,
  source
}: {
  locale: "ru" | "en";
  source?: SourceDraft | null;
}) {
  const isEdit = Boolean(source);
  const formAction = isEdit ? updateSourceAction.bind(null, source!.id) : createSourceAction;

  return (
    <article className="policy-card">
      <h3>{locale === "ru" ? (isEdit ? "Редактировать источник" : "Новый источник") : isEdit ? "Edit source" : "New source"}</h3>
      <form action={formAction} className="admin-form">
        <label className="admin-field">
          <span>{locale === "ru" ? "Название" : "Label"}</span>
          <input name="label" defaultValue={source?.label ?? ""} required />
        </label>

        <label className="admin-field">
          <span>Slug</span>
          <input name="slug" defaultValue={source?.slug ?? ""} placeholder="auto-from-label" />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Тип" : "Type"}</span>
            <select name="type" defaultValue={source?.type ?? "official"}>
              <option value="official">official</option>
              <option value="interview">interview</option>
              <option value="social">social</option>
              <option value="press_release">press_release</option>
              <option value="stats">stats</option>
            </select>
          </label>

          <label className="admin-field">
            <span>URL</span>
            <input name="url" type="url" defaultValue={source?.url ?? ""} required />
          </label>
        </div>

        <div className="admin-actions">
          <button type="submit" className="button">
            {locale === "ru" ? (isEdit ? "Сохранить источник" : "Создать источник") : isEdit ? "Save source" : "Create source"}
          </button>
          {isEdit ? (
            <form action={deleteSourceAction}>
              <input type="hidden" name="sourceId" value={source!.id} />
              <button type="submit" className="button-secondary">
                {locale === "ru" ? "Удалить" : "Delete"}
              </button>
            </form>
          ) : null}
        </div>
      </form>
    </article>
  );
}
