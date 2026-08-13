export const PRODUCTION_SITE_URL = "https://fightbase.ru";
const LOCAL_SITE_URL = "http://localhost:3000";

export function resolveSiteUrl(candidate: string | null | undefined, isProduction: boolean) {
  const fallback = isProduction ? PRODUCTION_SITE_URL : LOCAL_SITE_URL;

  try {
    const url = new URL(candidate?.trim() || fallback);
    const isHttpUrl = url.protocol === "http:" || url.protocol === "https:";
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (!isHttpUrl || (isProduction && (url.protocol !== "https:" || isLocalHost))) {
      return new URL(fallback);
    }

    return new URL(url.origin);
  } catch {
    return new URL(fallback);
  }
}

export function getSiteUrl() {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV === "production");
}
