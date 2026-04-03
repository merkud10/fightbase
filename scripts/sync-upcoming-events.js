#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { decodeHtmlEntities, extractMetaContent, fetchText, parseTextDate, stripTags } = require("./fighter-import-utils");

const prisma = new PrismaClient();

const SOURCES = [
  {
    promotionSlug: "ufc",
    listingUrl: "https://www.ufc.com/events",
    collectListingEntries(html) {
      const entries = [];
      const seen = new Set();
      const pattern =
        /<h3 class="c-card-event--result__headline"><a href="([^"]+)">([\s\S]*?)<\/a><\/h3>[\s\S]*?<a href="[^"]+">([^<]+)<\/a>/gi;

      for (const match of html.matchAll(pattern)) {
        const url = new URL(match[1], "https://www.ufc.com").toString();
        const title = stripTags(match[2]);
        const dateText = stripTags(match[3]);
        if (seen.has(url)) {
          continue;
        }
        seen.add(url);
        entries.push({ url, title, dateText });
      }

      return entries.slice(0, 8);
    }
  }
];

const locationTranslations = new Map([
  ["Bangkok", "Бангкок"],
  ["Tokyo", "Токио"],
  ["Las Vegas", "Лас-Вегас"],
  ["Miami", "Майами"],
  ["Winnipeg", "Виннипег"],
  ["Riyadh", "Эр-Рияд"],
  ["Singapore", "Сингапур"],
  ["Lumpinee Stadium", "Lumpinee Stadium"],
  ["Meta APEX", "Meta APEX"],
  ["Kaseya Center", "Kaseya Center"],
  ["Canada Life Centre", "Canada Life Centre"],
  ["Ariake Arena", "Ariake Arena"],
  ["United States", "США"],
  ["Canada", "Канада"],
  ["Thailand", "Таиланд"],
  ["Japan", "Япония"]
]);

function slugFromUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function formatRussianDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function translateLocationLabel(value) {
  const clean = String(value || "").trim();
  if (!clean || clean === "TBD") {
    return "";
  }

  return clean
    .split(/\s*,\s*|\s{2,}/)
    .flatMap((part) => part.split(/\s+(?=United States|Canada|Thailand|Japan)\b/))
    .map((part) => locationTranslations.get(part.trim()) || part.trim())
    .filter(Boolean)
    .join(", ");
}

function buildRussianEventSummary(promotion, facts, fallbackTitle) {
  const eventName = facts.name || fallbackTitle;
  const dateLabel = facts.date ? formatRussianDate(facts.date) : null;
  const locationBits = [translateLocationLabel(facts.venue), translateLocationLabel(facts.city)].filter(Boolean);
  const locationLabel = locationBits.join(", ");
  const shortName = String(promotion?.shortName || "").trim();
  const lead =
    shortName && !eventName.toLowerCase().startsWith(shortName.toLowerCase())
      ? `${shortName}: ${eventName}`
      : eventName;

  if (dateLabel && locationLabel) {
    return `${lead} пройдет ${dateLabel} на арене ${locationLabel}.`;
  }

  if (dateLabel) {
    return `${lead} пройдет ${dateLabel}.`;
  }

  if (locationLabel) {
    return `${lead} состоится на арене ${locationLabel}.`;
  }

  return `${lead}.`;
}

function inferYearFromUrl(url) {
  const match = String(url || "").match(/20\d{2}/);
  return match ? Number(match[0]) : new Date().getUTCFullYear();
}

function parseJsonLdObjects(html) {
  const results = [];

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = String(match[1] || "").trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      results.push(parsed);
    } catch {}
  }

  return results;
}

function flattenObjects(value) {
  const queue = Array.isArray(value) ? [...value] : [value];
  const flat = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") {
      continue;
    }

    flat.push(current);

    for (const nested of Object.values(current)) {
      if (nested && typeof nested === "object") {
        queue.push(nested);
      }
    }
  }

  return flat;
}

function parseDateFromValue(value, fallbackUrl = "") {
  if (!value) {
    return null;
  }

  const clean = String(value).trim().replace(/\s+/g, " ");
  const direct = new Date(clean);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const scheduleMatch = clean.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Za-z]{3})\s+(\d{1,2})(?:\s*\/\s*(\d{1,2}:\d{2})\s*(AM|PM))?/i
  );

  if (scheduleMatch) {
    const year = inferYearFromUrl(fallbackUrl);
    const parsed = parseTextDate(`${scheduleMatch[1]} ${scheduleMatch[2]} ${year}`);
    if (parsed) {
      if (scheduleMatch[3] && scheduleMatch[4]) {
        const [hoursRaw, minutesRaw] = scheduleMatch[3].split(":").map(Number);
        let hours = hoursRaw;
        if (scheduleMatch[4].toUpperCase() === "PM" && hours < 12) {
          hours += 12;
        }
        if (scheduleMatch[4].toUpperCase() === "AM" && hours === 12) {
          hours = 0;
        }
        parsed.setUTCHours(hours, minutesRaw, 0, 0);
      }
      return parsed;
    }
  }

  return parseTextDate(clean);
}

function extractEventName(html, fallbackTitle) {
  const fromMeta = extractMetaContent(html, "og:title") || extractMetaContent(html, "title");
  const title = fromMeta || (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "") || fallbackTitle;

  return stripTags(title)
    .replace(/\s+\|\s+UFC$/i, "")
    .trim();
}

function extractEventSummary(html, fallbackTitle) {
  return (
    extractMetaContent(html, "description") ||
    extractMetaContent(html, "og:description") ||
    `${fallbackTitle} upcoming event card`
  );
}

function extractEventFacts(html, entry) {
  const flattened = parseJsonLdObjects(html).flatMap(flattenObjects);
  const sportsEvent =
    flattened.find((item) => item["@type"] === "SportsEvent" || item["@type"] === "Event") ||
    flattened.find((item) => item.startDate || item.location);

  const startDate =
    parseDateFromValue(sportsEvent?.startDate, entry.url) ||
    parseDateFromValue(html.match(/datetime=["']([^"']+)["']/i)?.[1], entry.url) ||
    parseDateFromValue(entry.dateText, entry.url);

  const locationName =
    stripTags(sportsEvent?.location?.name || "") ||
    stripTags(sportsEvent?.location?.address?.addressLocality || "") ||
    stripTags(html.match(/Location[\s\S]{0,120}?>([^<]{3,80})</i)?.[1] || "") ||
    stripTags(html.match(/city[^>]*>\s*([^<]{3,80})</i)?.[1] || "");

  const venue =
    stripTags(sportsEvent?.location?.name || "") ||
    stripTags(html.match(/Venue[\s\S]{0,120}?>([^<]{3,120})</i)?.[1] || "") ||
    stripTags(html.match(/venue[^>]*>\s*([^<]{3,120})</i)?.[1] || "") ||
    locationName ||
    "TBD";

  const city =
    stripTags(sportsEvent?.location?.address?.addressLocality || "") ||
    stripTags(html.match(/addressLocality["']?\s*:\s*["']([^"']+)["']/i)?.[1] || "") ||
    stripTags(String(entry.locationText || "").split(",").pop() || "") ||
    locationName ||
    "TBD";

  const extractedName = extractEventName(html, entry.title);

  return {
    name: /^(UFC Fight Night|UFC \d+)$/i.test(extractedName) && entry.title ? `${extractedName}: ${entry.title}` : extractedName,
    summary: extractEventSummary(html, entry.title),
    date: startDate,
    city: city || "TBD",
    venue: venue || "TBD"
  };
}

async function upsertEvent(promotion, source, entry) {
  const html = await fetchText(entry.url);
  const facts = extractEventFacts(html, entry);

  if (!facts.date) {
    throw new Error(`Could not determine event date for ${entry.url}`);
  }

  if (facts.date.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return { skipped: true, reason: "past" };
  }

  const slug = slugFromUrl(entry.url);
  const data = {
    slug,
    name: facts.name || entry.title || slug.replace(/-/g, " "),
    date: facts.date,
    city: facts.city,
    venue: facts.venue,
    status: "upcoming",
    summary: buildRussianEventSummary(promotion, facts, entry.title || slug.replace(/-/g, " ")),
    promotionId: promotion.id
  };

  const existing = await prisma.event.findUnique({ where: { slug } });
  if (existing) {
    await prisma.event.update({ where: { id: existing.id }, data });
    return { updated: true, slug };
  }

  await prisma.event.create({ data });
  return { created: true, slug };
}

async function main() {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const source of SOURCES) {
    const promotion = await prisma.promotion.findUnique({ where: { slug: source.promotionSlug } });
    if (!promotion) {
      console.error(`Promotion ${source.promotionSlug} not found`);
      continue;
    }

    const listingHtml = await fetchText(source.listingUrl);
    const entries = source.collectListingEntries(listingHtml);

    console.log(`${source.promotionSlug.toUpperCase()}: found ${entries.length} listing entries`);

    for (const entry of entries) {
      try {
        const result = await upsertEvent(promotion, source, entry);
        if (result?.created) {
          created += 1;
          console.log(`[created] ${result.slug}`);
        } else if (result?.updated) {
          updated += 1;
          console.log(`[updated] ${result.slug}`);
        } else {
          skipped += 1;
        }
      } catch (error) {
        skipped += 1;
        console.error(`[skipped] ${entry.url}: ${error.message || error}`);
      }
    }
  }

  console.log("");
  console.log("Summary");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
