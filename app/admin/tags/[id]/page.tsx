import { notFound } from "next/navigation";

import { AdminTagForm } from "@/components/admin-tag-form";
import { PageHero } from "@/components/page-hero";
import { getAdminTagEditorData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminTagEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const tag = await getAdminTagEditorData(id);

  if (!tag) {
    notFound();
  }

  return (
    <main className="container">
      <PageHero
        eyebrow={`/admin/tags/${id}`}
        title={locale === "ru" ? "Редактор тега" : "Tag editor"}
        description={tag.label}
      />

      <AdminTagForm locale={locale} tag={tag} />
    </main>
  );
}
