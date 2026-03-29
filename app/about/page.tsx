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
            ? "FightBase это MMA-медиа платформа, построенная вокруг сущностей, перелинковки и AI-assisted редакционных процессов."
            : "FightBase is an MMA media platform designed around entities, internal linking, and AI-assisted editorial workflows."
        }
      />

      <section className="policy-card">
        <h3>{locale === "ru" ? "Как это работает" : "Operating model"}</h3>
        <p>
          {locale === "ru"
            ? "Новости, турниры, бойцы и аналитика опираются на общие данные. Это позволяет агенту один раз ingest-ить факты, а потом публиковать несколько полезных представлений без превращения сайта в контентную свалку."
            : "News, events, fighters, and analysis all sit on top of shared data. That lets an agent ingest facts once, then publish multiple useful views without turning the site into a content dump."}
        </p>
      </section>
    </main>
  );
}
