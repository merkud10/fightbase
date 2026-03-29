import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export default async function EditorialPolicyPage() {
  const locale = await getLocale();
  return (
    <main className="container">
      <PageHero
        eyebrow="/editorial-policy"
        title={locale === "ru" ? "Редакционная политика" : "Editorial policy"}
        description={
          locale === "ru"
            ? "AI может структурировать факты и предлагать саммари, но интерпретация, фрейминг и спорные утверждения должны быть явно помечены."
            : "AI can structure facts and suggest summaries, but interpretation, framing, and disputed claims should remain clearly labeled."
        }
      />
    </main>
  );
}
