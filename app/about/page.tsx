import { PageHero } from "@/components/page-hero";
import { getLocale } from "@/lib/i18n";

export default async function AboutPage() {
  const locale = await getLocale();

  return (
    <main className="container">
      <PageHero
        eyebrow="/about"
        title={locale === "ru" ? "О FightBase" : "About FightBase"}
        description={
          locale === "ru"
            ? "FightBase — это MMA-медиа платформа, построенная вокруг новостей, турниров, профилей бойцов и глубокой внутренней перелинковки."
            : "FightBase is an MMA media platform built around news, events, fighter profiles, and strong internal linking."
        }
      />

      <section className="policy-card">
        <h3>{locale === "ru" ? "Как это работает" : "Operating model"}</h3>
        <p>
          {locale === "ru"
            ? "Новости, турниры, бойцы и аналитика опираются на общие данные и редакционную структуру. Это помогает связывать материалы между собой и не превращать сайт в разрозненный набор публикаций."
            : "News, events, fighters, and analysis all sit on top of shared data and one editorial structure, which keeps the site connected instead of fragmented."}
        </p>
      </section>
    </main>
  );
}
