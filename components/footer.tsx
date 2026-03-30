import Link from "next/link";

import { getDictionary, getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";

export async function Footer() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div>
          <strong>FightBase Media</strong>
          <p className="muted">
            {locale === "ru"
              ? "Новости, турниры, бойцы, аналитика и редакционное покрытие главных событий в ММА."
              : "News, events, fighters, analysis, and editorial coverage across the MMA landscape."}
          </p>
        </div>
        <div className="footer-links">
          <Link href={localizePath("/about", locale)}>{t.nav.about}</Link>
          <Link href={localizePath("/sources-policy", locale)}>{locale === "ru" ? "Политика источников" : "Sources policy"}</Link>
          <Link href={localizePath("/editorial-policy", locale)}>{locale === "ru" ? "Редакционная политика" : "Editorial policy"}</Link>
          <Link href={localizePath("/privacy-policy", locale)}>{locale === "ru" ? "Приватность" : "Privacy"}</Link>
          <Link href={localizePath("/terms", locale)}>{locale === "ru" ? "Условия" : "Terms"}</Link>
          <Link href={localizePath("/disclaimer", locale)}>{locale === "ru" ? "Дисклеймер" : "Disclaimer"}</Link>
        </div>
      </div>
    </footer>
  );
}
