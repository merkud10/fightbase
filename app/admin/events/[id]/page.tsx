import { notFound } from "next/navigation";

import { AdminEventForm } from "@/components/admin-event-form";
import { PageHero } from "@/components/page-hero";
import { getAdminEventEditorData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminEventEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const data = await getAdminEventEditorData(id);

  if (!data.event) {
    notFound();
  }

  return (
    <main className="container">
      <PageHero
        eyebrow={`/admin/events/${id}`}
        title={locale === "ru" ? "Редактор турнира" : "Event editor"}
        description={data.event.name}
      />

      <AdminEventForm
        locale={locale}
        promotions={data.promotions.map((promotion) => ({ id: promotion.id, label: promotion.shortName }))}
        event={data.event}
      />
    </main>
  );
}
