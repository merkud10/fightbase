import {
  createTagAction,
  deleteTagAction,
  updateTagAction
} from "@/app/admin/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type TagDraft = {
  id: string;
  slug: string;
  label: string;
};

export function AdminTagForm({
  locale,
  tag
}: {
  locale: "ru" | "en";
  tag?: TagDraft | null;
}) {
  const isEdit = Boolean(tag);
  const formAction = isEdit ? updateTagAction.bind(null, tag!.id) : createTagAction;

  return (
    <article className="policy-card">
      <h3>{locale === "ru" ? (isEdit ? "Редактировать тег" : "Новый тег") : isEdit ? "Edit tag" : "New tag"}</h3>
      <form action={formAction} className="admin-form">
        <label className="admin-field">
          <span>{locale === "ru" ? "Название" : "Label"}</span>
          <input name="label" defaultValue={tag?.label ?? ""} required />
        </label>

        <label className="admin-field">
          <span>Slug</span>
          <input name="slug" defaultValue={tag?.slug ?? ""} placeholder="auto-from-label" />
        </label>

        <div className="admin-actions">
          <button type="submit" className="button">
            {locale === "ru" ? (isEdit ? "Сохранить тег" : "Создать тег") : isEdit ? "Save tag" : "Create tag"}
          </button>
        </div>
      </form>
      {isEdit ? (
        <form action={deleteTagAction}>
          <input type="hidden" name="tagId" value={tag!.id} />
          <ConfirmDeleteButton
            label={locale === "ru" ? "Удалить" : "Delete"}
            confirmMessage={locale === "ru" ? "Удалить? Это действие необратимо." : "Delete? This action is irreversible."}
          />
        </form>
      ) : null}
    </article>
  );
}
