import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description:
    "Политика конфиденциальности FightBase Media: обработка технических данных, аналитики, форм обратной связи и подписок.",
  alternates: buildLocaleAlternates("/privacy-policy")
};

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/privacy-policy"
        title={locale === "ru" ? "Политика конфиденциальности" : "Privacy policy"}
        description={
          locale === "ru"
            ? "На этой странице описано, какие технические и пользовательские данные может получать FightBase Media, как они используются и как связаться с редакцией по вопросам обработки данных."
            : "This page explains which technical and user data FightBase Media may receive, how it may be used, and how to contact the editorial team about data handling."
        }
      />
      <section className="page-grid policy-grid">
        <article className="policy-card">
          <h3>{locale === "ru" ? "Какие данные мы можем получать" : "What data we may collect"}</h3>
          <ul>
            <li>
              {locale === "ru"
                ? "Технические данные: IP-адрес, тип устройства, версия браузера, язык, дата и время визита."
                : "Technical data such as IP address, device type, browser version, language, and visit timestamps."}
            </li>
            <li>
              {locale === "ru"
                ? "Аналитические события: просмотры страниц, переходы по разделам, глубина просмотра и взаимодействия с контентом."
                : "Analytics events such as page views, section navigation, scroll depth, and content interactions."}
            </li>
            <li>
              {locale === "ru"
                ? "Данные, которые пользователь передает добровольно через формы подписки, обратной связи или деловые запросы."
                : "Information voluntarily provided through subscriptions, contact forms, or business inquiries."}
            </li>
          </ul>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Зачем это нужно" : "Why this data is used"}</h3>
          <ul>
            <li>
              {locale === "ru"
                ? "Для стабильной работы сайта, диагностики ошибок и защиты от злоупотреблений."
                : "To keep the site stable, diagnose issues, and protect the service from abuse."}
            </li>
            <li>
              {locale === "ru"
                ? "Для редакционной аналитики: понимания, какие разделы и материалы наиболее полезны аудитории."
                : "For editorial analytics to understand which sections and stories are most useful to readers."}
            </li>
            <li>
              {locale === "ru"
                ? "Для обратной связи по подпискам, деловым запросам и вопросам об использовании материалов."
                : "To respond to subscriptions, business requests, and questions about the use of published materials."}
            </li>
          </ul>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Файлы cookie и аналитика" : "Cookies and analytics"}</h3>
          <p>
            {locale === "ru"
              ? "FightBase Media может использовать cookie и стандартные инструменты веб-аналитики для сохранения языковых настроек, оценки производительности и анализа навигации по сайту. При появлении новых рекламных или подписных функций эта политика будет обновлена отдельно."
              : "FightBase Media may use cookies and standard analytics tools to remember language settings, measure performance, and analyze on-site navigation. If advertising or subscription features are introduced later, this policy will be updated accordingly."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Контакты и обновления" : "Contact and updates"}</h3>
          <p>
            {locale === "ru"
              ? "Политика может обновляться по мере развития сайта. Если у вас есть вопросы о конфиденциальности или обработке данных, используйте редакционные контакты, указанные на странице About."
              : "This policy may be updated as new site features are introduced. If you have privacy or data handling questions, use the editorial contacts listed on the About page."}
          </p>
        </article>
      </section>
    </main>
  );
}
