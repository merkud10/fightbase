import Link from "next/link";

import { getDictionary, getLocale } from "@/lib/i18n";

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
              ? "Новости, турниры, бойцы, аналитика и AI-assisted редакционный workflow."
              : "News, events, fighters, analysis, and an AI-assisted editorial workflow."}
          </p>
        </div>
        <div className="footer-links">
          <Link href="/about">{t.nav.about}</Link>
          <Link href="/sources-policy">{locale === "ru" ? "Политика источников" : "Sources policy"}</Link>
          <Link href="/editorial-policy">{locale === "ru" ? "Редакционная политика" : "Editorial policy"}</Link>
          <Link href="/privacy-policy">{locale === "ru" ? "Приватность" : "Privacy"}</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/disclaimer">Disclaimer</Link>
        </div>
      </div>
    </footer>
  );
}
