import { notFound } from "next/navigation";

import { AdminArticleForm } from "@/components/admin-article-form";
import { PageHero } from "@/components/page-hero";
import { getAdminArticleEditorData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AdminArticleEditorPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const data = await getAdminArticleEditorData(id);

  if (!data.article) {
    notFound();
  }

  return (
    <main className="container">
      <PageHero
        eyebrow={`/admin/articles/${id}`}
        title={locale === "ru" ? "Редактор статьи" : "Article editor"}
        description={data.article.title}
      />

      <AdminArticleForm
        locale={locale}
        promotions={data.promotions.map((promotion) => ({ id: promotion.id, label: promotion.shortName }))}
        events={data.events.map((event) => ({ id: event.id, label: event.name }))}
        fighters={data.fighters.map((fighter) => ({ id: fighter.id, label: fighter.name }))}
        tags={data.tags.map((tag) => ({ id: tag.id, label: tag.label }))}
        sources={data.sources.map((source) => ({ id: source.id, label: source.label }))}
        article={data.article}
      />
    </main>
  );
}
