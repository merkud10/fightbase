import { EventCard } from "@/components/cards";
import { PageHero } from "@/components/page-hero";
import { events } from "@/lib/data";
import { getLocale } from "@/lib/i18n";

export default async function EventsPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/events"
        title={locale === "ru" ? "Турниры" : "Events"}
        description={
          locale === "ru"
            ? "Ближайшие и завершённые турниры со структурой карда, превью, результатами и постфайт-материалами."
            : "Upcoming and completed fight nights with card structure, previews, results, and post-fight material."
        }
      />

      <section className="stack">
        <div className="filter-group">
          <h3>{locale === "ru" ? "Фильтры" : "Filters"}</h3>
          <span>{locale === "ru" ? "Предстоящие" : "Upcoming"}</span>
          <span>{locale === "ru" ? "Прошедшие" : "Past"}</span>
          <span>UFC</span>
          <span>PFL</span>
          <span>Bellator</span>
          <span>ONE</span>
        </div>

        <div className="event-grid">
          {events.map((event) => (
            <EventCard key={event.id} event={event} locale={locale} />
          ))}
        </div>
      </section>
    </main>
  );
}
