import { HeaderNavigation } from "@/components/header-navigation";
import { HeaderShell } from "@/components/header-shell";
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
    { href: "/analysis", label: locale === "ru" ? "Аналитика" : "Analysis" },
    { href: "/quotes", label: t.nav.quotes },
    { href: "/search", label: locale === "ru" ? "Поиск" : "Search" }
  ];

  return (
    <HeaderShell>
      <HeaderNavigation
        homeHref={localizePath("/", locale)}
        brandTagline={t.brandTagline}
        topline={
          locale === "ru"
            ? "Новости, турнирные страницы, прогнозы и аналитика UFC"
            : "UFC news, event pages, predictions, and analysis"
        }
        navLabel={locale === "ru" ? "Основная навигация" : "Primary navigation"}
        menuLabel={locale === "ru" ? "Открыть меню" : "Open menu"}
        closeMenuLabel={locale === "ru" ? "Закрыть меню" : "Close menu"}
        subscribeLabel={t.common.subscribe}
        locale={locale}
        navItems={navItems.map((item) => ({
          ...item,
          href: localizePath(item.href, locale)
        }))}
      />
    </HeaderShell>
  );
}
