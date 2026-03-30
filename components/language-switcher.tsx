"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { localeCookieName, type Locale } from "@/lib/locale-config";
import { localizePath, stripLocalePrefix } from "@/lib/locale-path";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextLocale: Locale = locale === "ru" ? "en" : "ru";

  function setLocale(next: Locale) {
    document.cookie = `${localeCookieName}=${next}; path=/; max-age=31536000; samesite=lax`;
    const stripped = stripLocalePrefix(pathname || "/").pathname;
    const search = searchParams.toString();
    router.push(localizePath(`${stripped}${search ? `?${search}` : ""}`, next));
    router.refresh();
  }

  return (
    <div className="locale-switcher" aria-label="Language switcher">
      <button type="button" className="button-ghost active-locale" onClick={() => setLocale(nextLocale)}>
        {locale.toUpperCase()} / {nextLocale.toUpperCase()}
      </button>
    </div>
  );
}
