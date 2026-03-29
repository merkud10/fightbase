import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/privacy-policy"
        title={locale === "ru" ? "Политика приватности" : "Privacy policy"}
        description={
          locale === "ru"
            ? "Зарезервируй эту страницу под cookies, подписки, аналитику и любые будущие аккаунтные функции."
            : "Reserve this page for cookies, subscriptions, analytics, and any future personalization or account features."
        }
      />
    </main>
  );
}
