import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { getRankingsPageData } from "@/lib/db";
import { getLocale } from "@/lib/i18n";

export default async function RankingsPage() {
  const locale = await getLocale();
  const ranking = (await getRankingsPageData()).slice(0, 10);

  return (
    <main className="container">
      <PageHero
        eyebrow="/rankings"
        title={locale === "ru" ? "Рейтинги" : "Rankings"}
        description={
          locale === "ru"
            ? "SEO-дружелюбные таблицы для pound-for-pound, весовых категорий, чемпионов и редакционного движения."
            : "SEO-friendly ranking tables for pound-for-pound, divisional lists, champions, and editorial movement."
        }
      />

      <section className="table-card">
        <h3>Pound-for-pound</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{locale === "ru" ? "Боец" : "Fighter"}</th>
                <th>{locale === "ru" ? "Рекорд" : "Record"}</th>
                <th>{locale === "ru" ? "Статус" : "Status"}</th>
                <th>{locale === "ru" ? "Профиль" : "Profile"}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((fighter, index) => (
                <tr key={fighter.id}>
                  <td>{index + 1}</td>
                  <td>{fighter.name}</td>
                  <td>{fighter.record}</td>
                  <td>{fighter.status}</td>
                  <td>
                    <Link href={`/fighters/${fighter.slug}`}>{locale === "ru" ? "Открыть" : "Open"}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
