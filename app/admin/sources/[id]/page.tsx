import { notFound } from "next/navigation";

import { AdminSourceForm } from "@/components/admin-source-form";
import { PageHero } from "@/components/page-hero";
import { getAdminSourceEditorData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminSourceEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const source = await getAdminSourceEditorData(id);

  if (!source) {
    notFound();
  }

  return (
    <main className="container">
      <PageHero
        eyebrow={`/admin/sources/${id}`}
        title={locale === "ru" ? "Редактор источника" : "Source editor"}
        description={source.label}
      />

      <AdminSourceForm locale={locale} source={source} />
    </main>
  );
}
