import { FighterCard } from "@/components/cards";
import { PageHero } from "@/components/page-hero";
import { fighters } from "@/lib/data";
import { getLocale } from "@/lib/i18n";

export default async function FightersPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/fighters"
        title={locale === "ru" ? "Бойцы" : "Fighters"}
        description={
          locale === "ru"
            ? "База профилей с поиском, статусом, промоушеном, категорией, историей и точками для таймлайна."
            : "A searchable profile database with status, promotion, category, history, and timeline hooks."
        }
      />

      <section className="page-grid">
        <aside className="stack">
          <div className="filter-group">
            <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
            <span>{locale === "ru" ? "Активные" : "Active"}</span>
            <span>{locale === "ru" ? "Чемпионы" : "Champion"}</span>
            <span>{locale === "ru" ? "Завершили карьеру" : "Retired"}</span>
            <span>{locale === "ru" ? "Проспекты" : "Prospect"}</span>
            <span>Lightweight</span>
            <span>Welterweight</span>
          </div>
        </aside>

        <div className="fighter-grid">
          {fighters.map((fighter) => (
            <FighterCard key={fighter.id} fighter={fighter} locale={locale} />
          ))}
        </div>
      </section>
    </main>
  );
}
