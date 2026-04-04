import Link from "next/link";

import { HeaderShell } from "@/components/header-shell";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
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
    { href: "/predictions", label: t.nav.predictions },
    { href: "/analysis", label: locale === "ru" ? "Аналитика" : "Analysis" }
  ];

  return (
    <HeaderShell>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link href={localizePath("/", locale)} className="brand">
            <span className="brand-mark">FB</span>
            <span className="brand-copy">
              <span>FightBase</span>
              <small>{t.brandTagline}</small>
            </span>
          </Link>

          <div className="header-nav-shell">
            <span className="header-topline">
              {locale === "ru"
                ? "Новости, турнирные страницы, прогнозы и аналитика UFC"
                : "UFC news, event pages, predictions, and analysis"}
            </span>
            <nav className="nav-links" aria-label="Primary">
              {navItems.map((item) => (
                <Link key={item.href} href={localizePath(item.href, locale)} className="nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="header-actions">
            <PushSubscribeButton label={t.common.subscribe} locale={locale} />
          </div>
        </div>
      </header>
    </HeaderShell>
  );
}
