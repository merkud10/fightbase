"use client";

import { useRouter } from "next/navigation";

import { localeCookieName, type Locale } from "@/lib/locale-config";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const nextLocale: Locale = locale === "ru" ? "en" : "ru";

  function setLocale(nextLocale: Locale) {
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="locale-switcher" aria-label="Language switcher">
      <button
        type="button"
        className="button-ghost active-locale"
        onClick={() => setLocale(nextLocale)}
      >
        {locale.toUpperCase()} / {nextLocale.toUpperCase()}
      </button>
    </div>
  );
}
