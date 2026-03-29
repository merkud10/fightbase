import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export default async function TermsPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/terms"
        title={locale === "ru" ? "Условия использования" : "Terms"}
        description={
          locale === "ru"
            ? "Используй эту страницу для общих условий сайта, правил пользовательского контента и сервисных дисклеймеров."
            : "Use this page for general site usage terms, user content rules, and service disclaimers."
        }
      />
    </main>
  );
}
