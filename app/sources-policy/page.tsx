import type { Metadata } from "next";

export const revalidate = 86400;

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildPageMetadata } from "@/lib/page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();

  return buildPageMetadata({
    locale,
    path: "/sources-policy",
    title: locale === "ru" ? "Политика источников" : "Sources policy",
    description:
      locale === "ru"
        ? "Откуда FightBase берёт новости, рейтинги, результаты боёв, статистику и коэффициенты."
        : "How FightBase Media uses official sources, interviews, statistics providers, and verification in UFC coverage."
  });
}

export default async function SourcesPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/sources-policy"
        title={locale === "ru" ? "Политика источников" : "Sources policy"}
        description={
          locale === "ru"
            ? "Откуда на сайте новости, рейтинги, результаты боёв и коэффициенты."
            : "FightBase Media relies on primary and verifiable sources for news, event coverage, fighter profiles, and statistics."
        }
      />
      <section className="page-grid policy-grid">
        <article className="policy-card">
          <h3>{locale === "ru" ? "Новости" : "Source hierarchy"}</h3>
          <ul>
            <li>
              {locale === "ru"
                ? "Sherdog и MMA Fighting — основные источники новостей."
                : "Official promotion and league websites such as UFC and other primary rights holders."}
            </li>
            <li>
              {locale === "ru"
                ? "Сайт UFC — анонсы турниров и официальные сообщения."
                : "Interviews with fighters, coaches, matchmakers, and promotion representatives."}
            </li>
            <li>
              {locale === "ru"
                ? "Под заголовком каждой новости стоит ссылка на исходный материал."
                : "Official social channels, press releases, and verified statistics providers."}
            </li>
          </ul>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Результаты и статистика" : "How stories are checked"}</h3>
          <p>
            {locale === "ru"
              ? "Карды турниров и результаты боёв берём из данных ESPN. Статистика бойцов приходит из ESPN и UFC.com."
              : "If a story affects a fight card, title picture, medical status, event date, or regulatory decision, the newsroom seeks confirmation from at least one direct source. When accounts conflict, official statements and regulatory publications take priority."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Рейтинги и коэффициенты" : "When coverage is updated"}</h3>
          <p>
            {locale === "ru"
              ? "Официальные рейтинги UFC сверяем с UFC.com каждый день. Коэффициенты на бой считаем как среднее по нескольким букмекерам; с началом турнира линия больше не обновляется."
              : "Coverage is updated when new verified information appears, including bout announcements, card changes, results, statistics, or revised athlete details."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Нашли ошибку?" : "Link transparency"}</h3>
          <p>
            {locale === "ru"
              ? "Напишите нам в Telegram или VK, ссылки есть на каждой странице. Проверим и исправим."
              : "Where appropriate, FightBase Media names the source behind a report and preserves a link to the original publication. This is especially important for news, rankings, statistics, and quotations."}
        </p>
      </article>
      </section>
    </main>
  );
}
