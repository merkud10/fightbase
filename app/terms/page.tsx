import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Условия использования",
  description:
    "Условия использования FightBase Media: правила доступа к материалам, допустимое цитирование и ограничения ответственности.",
  alternates: {
    canonical: "/terms"
  }
};

export default async function TermsPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/terms"
        title={locale === "ru" ? "Условия использования" : "Terms of use"}
        description={
          locale === "ru"
            ? "Условия использования определяют правила доступа к материалам FightBase Media, порядок цитирования и пределы ответственности редакции."
            : "These terms describe how FightBase Media content may be accessed, cited, and used, along with editorial liability limits."
        }
      />
      <section className="page-grid policy-grid">
        <article className="policy-card">
          <h3>{locale === "ru" ? "Редакционные материалы" : "Editorial materials"}</h3>
          <p>
            {locale === "ru"
              ? "Новости, рейтинги, профили бойцов, турнирные страницы и аналитика публикуются в информационных целях. FightBase Media стремится к точности, но не может гарантировать, что каждая статистическая деталь или расписание останутся неизменными после публикации."
              : "News, rankings, fighter profiles, event cards, and analysis are published for informational purposes. FightBase Media aims for accuracy but cannot guarantee that every statistic or schedule detail will remain unchanged after publication."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Цитирование и использование" : "Quoting and reuse"}</h3>
          <ul>
            <li>
              {locale === "ru"
                ? "Допускается краткое цитирование материалов с обязательной ссылкой на FightBase Media."
                : "Short quotations are permitted with a visible credit and link back to FightBase Media."}
            </li>
            <li>
              {locale === "ru"
                ? "Полная перепечатка статей, таблиц или подборок без согласования не допускается."
                : "Full republication of articles, tables, or curated collections is not permitted without prior approval."}
            </li>
            <li>
              {locale === "ru"
                ? "Официальные логотипы, фотографии и промо-материалы могут принадлежать соответствующим лигам, промоушенам или правообладателям."
                : "Official logos, photos, and promotional assets may belong to their respective leagues, promotions, or rights holders."}
            </li>
          </ul>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Пользовательские действия" : "User conduct"}</h3>
          <p>
            {locale === "ru"
              ? "Если на сайте появятся комментарии, подписки, аккаунты или формы отправки пользовательского контента, запрещается публиковать незаконные, оскорбительные, вводящие в заблуждение или нарушающие авторские права материалы."
              : "If comments, subscriptions, accounts, or user submissions are introduced later, users may not publish unlawful, abusive, misleading, or copyright-infringing content."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Ограничение ответственности" : "Liability limits"}</h3>
          <p>
            {locale === "ru"
              ? "FightBase Media не несет ответственности за решения, принятые на основе опубликованной информации, включая ставки, инвестиции, поездки и коммерческие действия. Для официальных дат, медицинских обновлений и регуляторных решений всегда сверяйтесь с первоисточниками."
              : "FightBase Media is not responsible for decisions made on the basis of published information, including betting, investments, travel, or business actions. For official dates, medical updates, or regulatory decisions, always verify primary sources."}
          </p>
        </article>
      </section>
    </main>
  );
}
