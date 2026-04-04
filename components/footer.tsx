import Link from "next/link";

import { getDictionary, getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";

export async function Footer() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div className="footer-brand-block">
          <span className="footer-kicker">{locale === "ru" ? "UFC-медиа" : "UFC media"}</span>
          <strong>FightBase Media</strong>
          <p className="muted">
            {locale === "ru"
              ? "Новости UFC, аналитика, турнирные страницы, рейтинги и профили бойцов в одной аккуратной редакционной системе."
              : "UFC news, analysis, event pages, rankings, and fighter profiles in one streamlined editorial system."}
          </p>
        </div>

        <div className="footer-links">
          <Link href={localizePath("/about", locale)}>{t.nav.about}</Link>
          <Link href={localizePath("/analysis", locale)}>{locale === "ru" ? "Аналитика" : "Analysis"}</Link>
          <Link href={localizePath("/quotes", locale)}>{t.nav.quotes}</Link>
          <Link href={localizePath("/sources-policy", locale)}>
            {locale === "ru" ? "Политика источников" : "Sources policy"}
          </Link>
          <Link href={localizePath("/editorial-policy", locale)}>
            {locale === "ru" ? "Редакционная политика" : "Editorial policy"}
          </Link>
          <Link href={localizePath("/privacy-policy", locale)}>
            {locale === "ru" ? "Конфиденциальность" : "Privacy"}
          </Link>
          <Link href={localizePath("/terms", locale)}>{locale === "ru" ? "Условия" : "Terms"}</Link>
          <Link href={localizePath("/disclaimer", locale)}>
            {locale === "ru" ? "Дисклеймер" : "Disclaimer"}
          </Link>
        </div>
      </div>
    </footer>
  );
}
