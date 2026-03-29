import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export default async function SourcesPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/sources-policy"
        title={locale === "ru" ? "Политика источников" : "Sources policy"}
        description={
          locale === "ru"
            ? "Каждый материал должен явно показывать происхождение данных: официальные анонсы, интервью, соцсети и статистические провайдеры."
            : "Every article should expose source provenance clearly: official announcements, interviews, social posts, and statistics providers."
        }
      />
    </main>
  );
}
