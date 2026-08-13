"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PushSubscribeButton } from "@/components/push-subscribe-button";
import { isNavigationItemActive } from "@/lib/navigation";

type HeaderNavigationProps = {
  homeHref: string;
  brandTagline: string;
  topline: string;
  navLabel: string;
  menuLabel: string;
  closeMenuLabel: string;
  subscribeLabel: string;
  locale: string;
  navItems: Array<{
    href: string;
    label: string;
  }>;
};

const navigationPanelId = "primary-navigation-panel";

export function HeaderNavigation({
  homeHref,
  brandTagline,
  topline,
  navLabel,
  menuLabel,
  closeMenuLabel,
  subscribeLabel,
  locale,
  navItems
}: HeaderNavigationProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href={homeHref} className="brand">
          <span className="brand-mark">FB</span>
          <span className="brand-copy">
            <span>FightBase</span>
            <small>{brandTagline}</small>
          </span>
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          className="header-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls={navigationPanelId}
          aria-label={menuOpen ? closeMenuLabel : menuLabel}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="header-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <div
          id={navigationPanelId}
          className="header-navigation-panel"
          data-open={menuOpen ? "true" : "false"}
        >
          <div className="header-nav-shell">
            <span className="header-topline">{topline}</span>
            <nav className="nav-links" aria-label={navLabel}>
              {navItems.map((item) => {
                const active = isNavigationItemActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-link"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="header-actions">
            <PushSubscribeButton label={subscribeLabel} locale={locale} />
          </div>
        </div>
      </div>
    </header>
  );
}
