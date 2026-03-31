import {
  createEventAction,
  deleteEventAction,
  updateEventAction
} from "@/app/admin/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type PromotionOption = {
  id: string;
  label: string;
};

type EventDraft = {
  id: string;
  slug: string;
  name: string;
  date: Date;
  city: string;
  venue: string;
  status: string;
  summary: string;
  promotionId: string;
};

export function AdminEventForm({
  locale,
  promotions,
  event
}: {
  locale: "ru" | "en";
  promotions: PromotionOption[];
  event?: EventDraft | null;
}) {
  const isEdit = Boolean(event);
  const formAction = isEdit ? updateEventAction.bind(null, event!.id) : createEventAction;

  return (
    <article className="policy-card">
      <h3>{locale === "ru" ? (isEdit ? "Редактировать турнир" : "Новый турнир") : isEdit ? "Edit event" : "New event"}</h3>
      <form action={formAction} className="admin-form">
        <label className="admin-field">
          <span>{locale === "ru" ? "Название" : "Name"}</span>
          <input name="name" defaultValue={event?.name ?? ""} required />
        </label>

        <label className="admin-field">
          <span>Slug</span>
          <input name="slug" defaultValue={event?.slug ?? ""} placeholder="auto-from-name" />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Дата турнира" : "Event date"}</span>
            <input
              type="datetime-local"
              name="date"
              defaultValue={
                event?.date
                  ? new Date(event.date.getTime() - event.date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                  : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
              }
              required
            />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Статус" : "Status"}</span>
            <select name="status" defaultValue={event?.status ?? "upcoming"}>
              <option value="upcoming">upcoming</option>
              <option value="live">live</option>
              <option value="completed">completed</option>
            </select>
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Город" : "City"}</span>
            <input name="city" defaultValue={event?.city ?? ""} required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Арена" : "Venue"}</span>
            <input name="venue" defaultValue={event?.venue ?? ""} required />
          </label>
        </div>

        <label className="admin-field">
          <span>{locale === "ru" ? "Промоушен" : "Promotion"}</span>
          <select name="promotionId" defaultValue={event?.promotionId ?? promotions[0]?.id ?? ""} required>
            {promotions.map((promotion) => (
              <option key={promotion.id} value={promotion.id}>
                {promotion.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-field">
          <span>{locale === "ru" ? "Краткое описание" : "Summary"}</span>
          <textarea name="summary" rows={4} defaultValue={event?.summary ?? ""} required />
        </label>

        <div className="admin-actions">
          <button type="submit" className="button">
            {locale === "ru" ? (isEdit ? "Сохранить турнир" : "Создать турнир") : isEdit ? "Save event" : "Create event"}
          </button>
        </div>
      </form>
      {isEdit ? (
        <form action={deleteEventAction}>
          <input type="hidden" name="eventId" value={event!.id} />
          <ConfirmDeleteButton
            label={locale === "ru" ? "Удалить" : "Delete"}
            confirmMessage={locale === "ru" ? "Удалить? Это действие необратимо." : "Delete? This action is irreversible."}
          />
        </form>
      ) : null}
    </article>
  );
}
