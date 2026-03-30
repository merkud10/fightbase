import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";
import { getDictionary, getLocale } from "@/lib/i18n";
import { localizePath } from "@/lib/locale-path";

export async function Header() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const navItems = [
    { href: "/news", label: t.nav.news },
    { href: "/events", label: t.nav.events },
    { href: "/fighters", label: t.nav.fighters },
    { href: "/rankings", label: t.nav.rankings },
    { href: "/analysis", label: t.nav.analysis },
    { href: "/quotes", label: t.nav.quotes },
    { href: "/videos", label: t.nav.videos },
    { href: "/about", label: t.nav.about }
  ];

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href={localizePath("/", locale)} className="brand">
          <span className="brand-mark">FB</span>
          <span className="brand-copy">
            <span>FightBase</span>
            <small>{t.brandTagline}</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.href} href={localizePath(item.href, locale)} className="nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <span className="header-search-label">{t.common.search}</span>
          <LanguageSwitcher locale={locale} />
          <Link href={localizePath("/#subscribe", locale)} className="button">
            {t.common.subscribe}
          </Link>
        </div>
      </div>
    </header>
  );
}
