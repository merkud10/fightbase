import Link from "next/link";

import type { Locale } from "@/lib/locale-config";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
  params?: Record<string, string>;
  locale: Locale;
};

function buildPageHref(basePath: string, page: number, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  if (page > 1) {
    searchParams.set("page", String(page));
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({ currentPage, totalPages, basePath, params = {}, locale }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages: (number | "ellipsis")[] = [];
  const delta = 2;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "ellipsis") {
      pages.push("ellipsis");
    }
  }

  return (
    <nav className="pagination" aria-label={locale === "ru" ? "Навигация по страницам" : "Page navigation"}>
      {currentPage > 1 ? (
        <Link href={buildPageHref(basePath, currentPage - 1, params)} className="pagination-link pagination-prev">
          {locale === "ru" ? "← Назад" : "← Prev"}
        </Link>
      ) : (
        <span className="pagination-link pagination-prev pagination-disabled">
          {locale === "ru" ? "← Назад" : "← Prev"}
        </span>
      )}

      <span className="pagination-pages">
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="pagination-ellipsis">…</span>
          ) : item === currentPage ? (
            <span key={item} className="pagination-link pagination-current" aria-current="page">{item}</span>
          ) : (
            <Link key={item} href={buildPageHref(basePath, item, params)} className="pagination-link">{item}</Link>
          )
        )}
      </span>

      {currentPage < totalPages ? (
        <Link href={buildPageHref(basePath, currentPage + 1, params)} className="pagination-link pagination-next">
          {locale === "ru" ? "Далее →" : "Next →"}
        </Link>
      ) : (
        <span className="pagination-link pagination-next pagination-disabled">
          {locale === "ru" ? "Далее →" : "Next →"}
        </span>
      )}
    </nav>
  );
}
