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
            ? "Редакционная политика FightBase опирается на проверяемые источники, точность формулировок и понятное разграничение новостей, аналитики и мнений."
            : "FightBase editorial policy is built around verifiable sourcing, precise wording, and a clear distinction between news, analysis, and opinion."
        }
      />
    </main>
  );
}
