#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");

const { parseArgs } = require("./fighter-import-utils");
const { deriveCardTimes, matchEspnEvent, normalizeEventDate } = require("./espn-event-utils");

const prisma = new PrismaClient();

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";

const locationTranslations = new Map([
  ["Bangkok", "Бангкок"],
  ["Tokyo", "Токио"],
  ["Las Vegas", "Лас-Вегас"],
  ["Miami", "Майами"],
  ["Winnipeg", "Виннипег"],
  ["Riyadh", "Эр-Рияд"],
  ["Singapore", "Сингапур"],
  ["Sacramento", "Сакраменто"],
  ["Jacksonville", "Джэксонвилл"],
  ["Houston", "Хьюстон"],
  ["New York", "Нью-Йорк"],
  ["Boston", "Бостон"],
  ["Chicago", "Чикаго"],
  ["Denver", "Денвер"],
  ["Dallas", "Даллас"],
  ["Atlanta", "Атланта"],
  ["Detroit", "Детройт"],
  ["Nashville", "Нэшвилл"],
  ["Abu Dhabi", "Абу-Даби"],
  ["London", "Лондон"],
  ["Paris", "Париж"],
  ["Melbourne", "Мельбурн"],
  ["Sydney", "Сидней"],
  ["Perth", "Перт"],
  ["Toronto", "Торонто"],
  ["Edmonton", "Эдмонтон"],
  ["Montreal", "Монреаль"],
  ["São Paulo", "Сан-Паулу"],
  ["Rio de Janeiro", "Рио-де-Жанейро"],
  ["Seoul", "Сеул"],
  ["Shanghai", "Шанхай"],
  ["Macau", "Макао"],
  ["Mexico City", "Мехико"],
  ["United States", "США"],
  ["USA", "США"],
  ["Canada", "Канада"],
  ["Thailand", "Таиланд"],
  ["Japan", "Япония"],
  ["Australia", "Австралия"],
  ["Brazil", "Бразилия"],
  ["United Kingdom", "Великобритания"],
  ["France", "Франция"],
  ["Germany", "Германия"],
  ["Saudi Arabia", "Саудовская Аравия"]
]);

function slugFromLabel(label) {
  return label
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function formatRussianDate(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function translateLocation(value) {
  const clean = String(value || "").trim();
  if (!clean || clean === "TBD") {
    return "";
  }
  return locationTranslations.get(clean) || clean;
}

function buildRussianEventSummary(promotion, name, date, venue, city) {
  const shortName = String(promotion?.shortName || "").trim();
  const lead =
    shortName && !name.toLowerCase().startsWith(shortName.toLowerCase())
      ? `${shortName}: ${name}`
      : name;

  const dateLabel = date ? formatRussianDate(date) : null;
  const venueLabel = translateLocation(venue);
  const cityLabel = translateLocation(city);
  const locationBits = [venueLabel, cityLabel].filter(Boolean);
  const locationLabel = [...new Set(locationBits)].join(", ");

  // formatRussianDate ends with "г." — never append another period after it.
  const endSentence = (text) => (text.endsWith(".") ? text : `${text}.`);

  if (dateLabel && locationLabel) {
    return endSentence(`${lead} пройдет ${dateLabel} на арене ${locationLabel}`);
  }
  if (dateLabel) {
    return endSentence(`${lead} пройдет ${dateLabel}`);
  }
  if (locationLabel) {
    return endSentence(`${lead} состоится на арене ${locationLabel}`);
  }
  return endSentence(lead);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`ESPN API HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

function extractVenueFromEvent(event) {
  const venue = event.venues?.[0] || event.competitions?.[0]?.venue;
  if (!venue) {
    return { venue: "TBD", city: "TBD" };
  }
  return {
    venue: venue.fullName || "TBD",
    city: venue.address?.city || "TBD"
  };
}

async function fetchUpcomingEntries() {
  const data = await fetchJson(ESPN_SCOREBOARD_URL);
  const calendar = data.leagues?.[0]?.calendar || [];
  const now = Date.now();
  const entries = [];

  for (const item of calendar) {
    const startDate = new Date(item.startDate);
    if (startDate.getTime() < now - 24 * 60 * 60 * 1000) {
      continue;
    }

    entries.push({
      label: item.label,
      date: startDate
    });
  }

  return entries;
}

function toEspnDateStr(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// Запрашиваем диапазон соседних дней и матчим по названию: событие у ESPN может
// быть датировано соседним днём относительно календарной записи (реальное время
// старта против полуночи UTC), и точечный ?dates=YYYYMMDD его не находит.
async function fetchEventDetails(entry) {
  const fallback = { venue: "TBD", city: "TBD", cardTimes: deriveCardTimes([]) };

  try {
    const from = new Date(entry.date.getTime() - 24 * 60 * 60 * 1000);
    const to = new Date(entry.date.getTime() + 24 * 60 * 60 * 1000);
    const data = await fetchJson(`${ESPN_SCOREBOARD_URL}?dates=${toEspnDateStr(from)}-${toEspnDateStr(to)}`);
    const event = matchEspnEvent(data.events, entry);

    if (event) {
      const competitionDates = (event.competitions || []).map((competition) => competition?.date);
      return {
        ...extractVenueFromEvent(event),
        cardTimes: deriveCardTimes(competitionDates)
      };
    }
  } catch (error) {
    console.warn(`Could not fetch event details for ${entry.label}: ${error.message}`);
  }

  return fallback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 0) || null;
  const eventSlug = String(args.event || "").trim();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const promotion = await prisma.promotion.findUnique({ where: { slug: "ufc" } });
  if (!promotion) {
    console.error("Promotion 'ufc' not found");
    process.exit(1);
  }

  console.log("Fetching upcoming events from ESPN API...");
  const entries = await fetchUpcomingEntries();

  const filtered = entries
    .filter((entry) => !eventSlug || slugFromLabel(entry.label) === eventSlug)
    .slice(0, limit ?? undefined);

  console.log(`UFC: found ${filtered.length} upcoming events`);

  for (const entry of filtered) {
    try {
      const slug = slugFromLabel(entry.label);
      const { venue, city, cardTimes } = await fetchEventDetails(entry);
      const eventDate = normalizeEventDate(entry.date, cardTimes.mainCardAt);

      const existing = await prisma.event.findUnique({ where: { slug } });

      let matchedEvent = existing || null;

      if (!matchedEvent) {
        const dayStart = new Date(entry.date);
        dayStart.setUTCHours(0, 0, 0, 0);
        dayStart.setUTCDate(dayStart.getUTCDate() - 1);
        const dayEnd = new Date(entry.date);
        dayEnd.setUTCHours(0, 0, 0, 0);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 2);

        matchedEvent = await prisma.event.findFirst({
          where: {
            promotionId: promotion.id,
            date: { gte: dayStart, lt: dayEnd }
          }
        });
      }

      if (matchedEvent && matchedEvent.status === "completed") {
        skipped += 1;
        console.log(`[skipped] ${matchedEvent.slug}: already completed`);
        continue;
      }

      const data = {
        slug,
        name: entry.label,
        date: eventDate,
        city,
        venue,
        status: "upcoming",
        summary: buildRussianEventSummary(promotion, entry.label, eventDate, venue, city),
        promotionId: promotion.id,
        // Не затираем сохранённые времена, если ESPN перестал их отдавать.
        ...(cardTimes.earlyPrelimsAt ? { earlyPrelimsAt: cardTimes.earlyPrelimsAt } : {}),
        ...(cardTimes.prelimsAt ? { prelimsAt: cardTimes.prelimsAt } : {}),
        ...(cardTimes.mainCardAt ? { mainCardAt: cardTimes.mainCardAt } : {})
      };

      if (matchedEvent) {
        await prisma.event.update({ where: { id: matchedEvent.id }, data });
        updated += 1;
        const oldSlug = matchedEvent.slug !== slug ? ` ${matchedEvent.slug} ->` : "";
        console.log(`[updated]${oldSlug} ${slug}`);
        continue;
      }

      await prisma.event.create({ data });
      created += 1;
      console.log(`[created] ${slug}`);
    } catch (error) {
      skipped += 1;
      console.error(`[skipped] ${entry.label}: ${error.message || error}`);
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
