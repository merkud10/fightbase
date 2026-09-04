// Shared builder for SportsEvent JSON-LD so the event detail and fight
// prediction pages emit identical, complete structured data.

import type { Locale } from "@/lib/locale-config";
import { localizePath } from "@/lib/locale-path";

// Брендовый логотип в public/. Единственный источник правды о файле и его
// размерах: на него опираются и JSON-LD издателя, и дефолтная OG-картинка.
export const BRAND_LOGO_PATH = "/gorilla-crown-logo.png";
export const BRAND_LOGO_SIZE = 1024;

// Official organizer sites by promotion name. Falls back to the site origin
// when a promotion isn't mapped, so organizer.url is always present.
const PROMOTION_OFFICIAL_URLS: Record<string, string> = {
  "ultimate fighting championship": "https://www.ufc.com",
  ufc: "https://www.ufc.com"
};

function promotionUrl(name: string, fallbackOrigin: string) {
  return PROMOTION_OFFICIAL_URLS[name.trim().toLowerCase()] ?? fallbackOrigin;
}

// A UFC card typically runs ~5 hours from the announced start time. Used to
// provide a reasonable endDate, which Google recommends for Event markup.
const EVENT_DURATION_MS = 5 * 60 * 60 * 1000;

export function eventStatusUrl(status: string) {
  if (status === "completed") return "https://schema.org/EventCompleted";
  if (status === "live") return "https://schema.org/EventInProgress";
  return "https://schema.org/EventScheduled";
}

export function toAbsoluteUrl(url: string, origin: string) {
  const raw = url.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${origin}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

// Google's structured-data image guidelines favor JPEG/PNG/WebP. Fighter
// photos are stored as AVIF, which Google may skip, so route AVIF/WebP through
// the same image service the project already uses for social posting to serve
// a JPEG. Other formats pass through unchanged. The source must be a public
// absolute URL (wsrv fetches it server-side).
export function toSearchImageUrl(url: string) {
  if (/\.(avif|webp)(\?|$)/i.test(url)) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=jpg&w=1200`;
  }
  return url;
}

type Performer = { name: string; url?: string };

type SportsEventInput = {
  name: string;
  url: string;
  description: string;
  inLanguage?: string;
  date: Date;
  venue: string;
  city: string;
  status: string;
  promotionName: string;
  // Site origin without a trailing slash, e.g. "https://fightbase.ru".
  siteOrigin: string;
  performers?: Performer[];
  images?: string[];
};

// Upstream feeds use the literal "TBD" until a venue is announced; that placeholder
// must not leak into structured data.
function knownLocationValue(value: string) {
  const normalized = String(value || "").trim();
  return normalized && normalized.toUpperCase() !== "TBD" ? normalized : null;
}

export function buildSportsEventJsonLd(input: SportsEventInput): Record<string, unknown> | null {
  const performers = (input.performers ?? []).filter((p) => p.name?.trim());
  const images = (input.images ?? []).filter(Boolean).map(toSearchImageUrl);
  const venue = knownLocationValue(input.venue);
  const city = knownLocationValue(input.city);

  // Google requires location.address. Keep the page, but omit Event markup until
  // an address is known; a venue name alone would still produce an invalid event.
  if (!city) return null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: input.name,
    description: input.description,
    url: input.url,
    startDate: input.date.toISOString(),
    endDate: new Date(input.date.getTime() + EVENT_DURATION_MS).toISOString(),
    eventStatus: eventStatusUrl(input.status),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      ...(venue ? { name: venue } : {}),
      address: city
    },
    organizer: {
      "@type": "SportsOrganization",
      name: input.promotionName,
      url: promotionUrl(input.promotionName, input.siteOrigin)
    }
  };

  if (images.length > 0) {
    jsonLd.image = images;
  }
  if (performers.length > 0) {
    jsonLd.performer = performers.map((p) => ({
      "@type": "Person",
      name: p.name,
      ...(p.url ? { url: p.url } : {})
    }));
  }
  if (input.inLanguage) {
    jsonLd.inLanguage = input.inLanguage;
  }

  return jsonLd;
}

export type BreadcrumbCrumb = {
  name: string;
  url: string;
};

export function buildWebSiteJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FightBase Media",
    // Сайт отдаётся только на русском; /en редиректится на /ru — см. buildLocaleAlternates
    // в lib/locale-path.ts. Поэтому локаль здесь зафиксирована, а не параметризована.
    url: `${siteUrl}/ru`,
    publisher: {
      "@type": "Organization",
      name: "FightBase Media"
    },
    inLanguage: "ru-RU",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/ru/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };
}

export function buildPublisherJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    "@type": "Organization",
    name: "FightBase Media",
    url: `${siteUrl}/ru`,
    logo: {
      "@type": "ImageObject",
      url: `${siteUrl}${BRAND_LOGO_PATH}`,
      width: BRAND_LOGO_SIZE,
      height: BRAND_LOGO_SIZE
    }
  };
}

export function buildBreadcrumbJsonLd(crumbs: BreadcrumbCrumb[]): Record<string, unknown> {
  const visible = crumbs.filter((crumb) => crumb.name.trim().length > 0);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: visible.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url
    }))
  };
}

export type BreadcrumbTrailItem = {
  label: string;
  href?: string;
};

// Собирает BreadcrumbList из того же массива, что рендерит видимый компонент
// Breadcrumbs, — так разметка не может разойтись с тем, что видит пользователь.
// Последняя крошка обычно без href: ей подставляется currentUrl.
export function buildTrailBreadcrumbJsonLd(
  items: BreadcrumbTrailItem[],
  options: { locale: Locale; siteUrl: string | URL; currentUrl: string }
): Record<string, unknown> {
  const origin = options.siteUrl.toString().replace(/\/$/, "");

  return buildBreadcrumbJsonLd(
    items.map((item) => ({
      name: item.label,
      url: item.href ? `${origin}${localizePath(item.href, options.locale)}` : options.currentUrl
    }))
  );
}
