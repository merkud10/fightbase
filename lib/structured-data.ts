// Shared builder for SportsEvent JSON-LD so the event detail and fight
// prediction pages emit identical, complete structured data.

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

export function buildSportsEventJsonLd(input: SportsEventInput): Record<string, unknown> {
  const performers = (input.performers ?? []).filter((p) => p.name?.trim());
  const images = (input.images ?? []).filter(Boolean).map(toSearchImageUrl);

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
      name: input.venue,
      address: input.city
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
