import type { Locale } from "@/lib/locale-config";

export const publicLocales: Locale[] = ["ru", "en"];

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "ru" || value === "en";
}

export function stripLocalePrefix(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const parts = normalized.split("/");
  const maybeLocale = parts[1];

  if (!isLocale(maybeLocale)) {
    return {
      locale: null,
      pathname: normalized
    };
  }

  const stripped = `/${parts.slice(2).join("/")}`.replace(/\/+/g, "/");

  return {
    locale: maybeLocale,
    pathname: stripped === "/" ? "/" : stripped.replace(/\/$/, "") || "/"
  };
}

export function localizePath(path: string, locale: Locale) {
  if (!path) {
    return `/${locale}`;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const [pathAndSearch, hash = ""] = path.split("#");
  const [pathnamePart, search = ""] = pathAndSearch.split("?");
  const pathname = pathnamePart.startsWith("/") ? pathnamePart : `/${pathnamePart}`;
  const stripped = stripLocalePrefix(pathname).pathname;
  const localizedPath = stripped === "/" ? `/${locale}` : `/${locale}${stripped}`;
  const searchSuffix = search ? `?${search}` : "";
  const hashSuffix = hash ? `#${hash}` : "";

  return `${localizedPath}${searchSuffix}${hashSuffix}`;
}

export function buildLocaleAlternates(path: string) {
  return {
    canonical: localizePath(path, "ru"),
    languages: {
      "ru-RU": localizePath(path, "ru"),
      "en-US": localizePath(path, "en"),
      "x-default": localizePath(path, "ru")
    }
  };
}
