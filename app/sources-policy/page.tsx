import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";
import { buildLocaleAlternates } from "@/lib/locale-path";

export const metadata: Metadata = {
  title: "Политика источников",
  description:
    "Как FightBase Media работает с официальными источниками, интервью, статистическими провайдерами и проверкой новостей.",
  alternates: buildLocaleAlternates("/sources-policy")
};

export default async function SourcesPolicyPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/sources-policy"
        title={locale === "ru" ? "Политика источников" : "Sources policy"}
        description={
          locale === "ru"
            ? "FightBase Media опирается на первичные и проверяемые источники при работе с новостями, турнирными страницами, профилями бойцов и статистикой."
            : "FightBase Media relies on primary and verifiable sources for news, event coverage, fighter profiles, and statistics."
        }
      />
      <section className="page-grid policy-grid">
        <article className="policy-card">
          <h3>{locale === "ru" ? "Приоритет источников" : "Source hierarchy"}</h3>
          <ul>
            <li>
              {locale === "ru"
                ? "Официальные сайты лиг и промоушенов: UFC и другие первичные правообладатели."
                : "Official promotion and league websites such as UFC and other primary rights holders."}
            </li>
            <li>
              {locale === "ru"
                ? "Интервью бойцов, тренеров, матчмейкеров и представителей промоушенов."
                : "Interviews with fighters, coaches, matchmakers, and promotion representatives."}
            </li>
            <li>
              {locale === "ru"
                ? "Официальные соцсети, пресс-релизы и статистические провайдеры."
                : "Official social channels, press releases, and verified statistics providers."}
            </li>
          </ul>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Как проверяются материалы" : "How stories are checked"}</h3>
          <p>
            {locale === "ru"
              ? "Если новость влияет на кард, титульную ситуацию, медицинский статус бойца, дату турнира или регуляторное решение, редакция старается подтвердить ее как минимум одним прямым источником. При расхождениях приоритет отдается официальным заявлениям и публикациям регулирующих органов."
              : "If a story affects a fight card, title picture, medical status, event date, or regulatory decision, the newsroom seeks confirmation from at least one direct source. When accounts conflict, official statements and regulatory publications take priority."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Когда материал обновляется" : "When coverage is updated"}</h3>
          <p>
            {locale === "ru"
              ? "Материалы обновляются, когда появляются новые подтвержденные данные: анонсы боев, изменения кардов, результаты, статистика или уточненные сведения о спортсменах."
              : "Coverage is updated when new verified information appears, including bout announcements, card changes, results, statistics, or revised athlete details."}
          </p>
        </article>
        <article className="policy-card">
          <h3>{locale === "ru" ? "Прозрачность ссылок" : "Link transparency"}</h3>
          <p>
            {locale === "ru"
              ? "Там, где это уместно, FightBase Media указывает источник информации и сохраняет ссылку на первоисточник. Это особенно важно для новостей, рейтингов, статистики и цитат."
              : "Where appropriate, FightBase Media names the source behind a report and preserves a link to the original publication. This is especially important for news, rankings, statistics, and quotations."}
        </p>
      </article>
      </section>
    </main>
  );
}
