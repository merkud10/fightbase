import { notFound } from "next/navigation";

import { AdminFighterForm } from "@/components/admin-fighter-form";
import { PageHero } from "@/components/page-hero";
import { getAdminFighterEditorData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminFighterEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const data = await getAdminFighterEditorData(id);

  if (!data.fighter) {
    notFound();
  }

  return (
    <main className="container">
      <PageHero
        eyebrow={`/admin/fighters/${id}`}
        title={locale === "ru" ? "Редактор бойца" : "Fighter editor"}
        description={data.fighter.name}
      />

      <AdminFighterForm
        locale={locale}
        promotions={data.promotions.map((promotion) => ({ id: promotion.id, label: promotion.shortName }))}
        fighter={data.fighter}
      />
    </main>
  );
}
