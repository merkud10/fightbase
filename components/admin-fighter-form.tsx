import {
  createFighterAction,
  deleteFighterAction,
  updateFighterAction
} from "@/app/admin/actions";

type PromotionOption = {
  id: string;
  label: string;
};

type FighterDraft = {
  id: string;
  slug: string;
  name: string;
  nickname: string | null;
  country: string;
  weightClass: string;
  status: string;
  record: string;
  age: number;
  heightCm: number;
  reachCm: number;
  team: string;
  style: string;
  bio: string;
  promotionId: string;
};

export function AdminFighterForm({
  locale,
  promotions,
  fighter
}: {
  locale: "ru" | "en";
  promotions: PromotionOption[];
  fighter?: FighterDraft | null;
}) {
  const isEdit = Boolean(fighter);
  const formAction = isEdit ? updateFighterAction.bind(null, fighter!.id) : createFighterAction;

  return (
    <article className="policy-card">
      <h3>{locale === "ru" ? (isEdit ? "Редактировать бойца" : "Новый боец") : isEdit ? "Edit fighter" : "New fighter"}</h3>
      <form action={formAction} className="admin-form">
        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Имя" : "Name"}</span>
            <input name="name" defaultValue={fighter?.name ?? ""} required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Никнейм" : "Nickname"}</span>
            <input name="nickname" defaultValue={fighter?.nickname ?? ""} />
          </label>
        </div>

        <label className="admin-field">
          <span>Slug</span>
          <input name="slug" defaultValue={fighter?.slug ?? ""} placeholder="auto-from-name" />
        </label>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Страна" : "Country"}</span>
            <input name="country" defaultValue={fighter?.country ?? ""} required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Весовая" : "Weight class"}</span>
            <input name="weightClass" defaultValue={fighter?.weightClass ?? ""} required />
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Статус" : "Status"}</span>
            <select name="status" defaultValue={fighter?.status ?? "active"}>
              <option value="active">active</option>
              <option value="champion">champion</option>
              <option value="retired">retired</option>
              <option value="prospect">prospect</option>
            </select>
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Рекорд" : "Record"}</span>
            <input name="record" defaultValue={fighter?.record ?? ""} required />
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Возраст" : "Age"}</span>
            <input name="age" type="number" min="0" defaultValue={fighter?.age ?? 30} required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Промоушен" : "Promotion"}</span>
            <select name="promotionId" defaultValue={fighter?.promotionId ?? promotions[0]?.id ?? ""} required>
              {promotions.map((promotion) => (
                <option key={promotion.id} value={promotion.id}>
                  {promotion.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Рост (см)" : "Height (cm)"}</span>
            <input name="heightCm" type="number" min="0" defaultValue={fighter?.heightCm ?? 180} required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Размах рук (см)" : "Reach (cm)"}</span>
            <input name="reachCm" type="number" min="0" defaultValue={fighter?.reachCm ?? 180} required />
          </label>
        </div>

        <div className="admin-grid">
          <label className="admin-field">
            <span>{locale === "ru" ? "Команда" : "Team"}</span>
            <input name="team" defaultValue={fighter?.team ?? ""} required />
          </label>

          <label className="admin-field">
            <span>{locale === "ru" ? "Стиль" : "Style"}</span>
            <input name="style" defaultValue={fighter?.style ?? ""} required />
          </label>
        </div>

        <label className="admin-field">
          <span>{locale === "ru" ? "Краткое описание" : "Bio"}</span>
          <textarea name="bio" rows={4} defaultValue={fighter?.bio ?? ""} required />
        </label>

        <div className="admin-actions">
          <button type="submit" className="button">
            {locale === "ru" ? (isEdit ? "Сохранить бойца" : "Создать бойца") : isEdit ? "Save fighter" : "Create fighter"}
          </button>
          {isEdit ? (
            <form action={deleteFighterAction}>
              <input type="hidden" name="fighterId" value={fighter!.id} />
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
