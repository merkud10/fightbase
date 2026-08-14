import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

import { PageHero } from "@/components/page-hero";
import { Pagination } from "@/components/pagination";
import { getArticleHref } from "@/lib/article-routes";
import { getQuotesPageData } from "@/lib/db";
import { getDisplayImageUrl } from "@/lib/image-proxy";
import { getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";
import { buildPageMetadata } from "@/lib/page-metadata";
import { readParam } from "@/lib/search-params";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { totalCount } = await getQuotesPageData();

  return {
    ...buildPageMetadata({
      locale,
      path: "/quotes",
      title: locale === "ru" ? "Интервью и прямая речь UFC" : "UFC interviews and quotes",
      description:
        locale === "ru"
          ? "Интервью, заявления и материалы FightBase Media, построенные вокруг прямой речи бойцов, тренеров и участников UFC-повестки."
          : "FightBase Media interviews and reports centered on direct quotes from UFC fighters, coaches, and other participants."
    }),
    robots: totalCount
      ? undefined
      : {
          index: false,
          follow: true
        }
  };
}

export default async function QuotesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const params = (await searchParams) ?? {};
  const page = Math.max(1, parseInt(readParam(params.page), 10) || 1);
  const { articles: quotes, page: currentPage, totalPages } = await getQuotesPageData(page);

  return (
    <main className="container">
      <PageHero
        title={locale === "ru" ? "Интервью и прямая речь" : "Interviews and direct quotes"}
        description={
          locale === "ru"
            ? "Раздел для интервью, пресс-конференций и материалов, где особенно важны точные формулировки и смысл сказанного."
            : "A desk for interviews, press conferences, and quote-driven pieces where phrasing and meaning matter most."
        }
      />

      {quotes.length > 0 ? (
        <>
        <section className="feature-grid">
          {quotes.map((article) => (
            <article key={article.id} className="feature-card editorial-card">
              {article.coverImageUrl ? (
                <div className="editorial-card-cover">
                  <Image
                    src={getDisplayImageUrl(article.coverImageUrl)}
                    alt={article.coverImageAlt || article.title}
                    className="editorial-card-cover-image"
                    width={720}
                    height={405}
                    sizes="(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 33vw"
                  />
                </div>
              ) : null}
              <p className="eyebrow">{locale === "ru" ? "Прямая речь" : "Direct quote"}</p>
              <h3>{article.title}</h3>
              <p className="copy">{article.excerpt || article.meaning}</p>
              <Link href={localizePath(getArticleHref(article.category, article.slug), locale)}>
                {locale === "ru" ? "Читать материал" : "Read story"}
              </Link>
            </article>
          ))}
        </section>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath={localizePath("/quotes", locale)}
          locale={locale}
        />
        </>
      ) : (
        <section className="filter-empty-state">
          <h3>{locale === "ru" ? "Раздел интервью пока пуст" : "The interview desk is currently empty"}</h3>
          <p className="copy">
            {locale === "ru"
              ? "После загрузки интервью и пресс-конференций они будут собираться здесь как отдельная редакционная витрина."
              : "Once interviews and press-conference coverage are published, they will appear here as a separate editorial desk."}
          </p>
        </section>
      )}
    </main>
  );
}
