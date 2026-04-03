#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const API_BASE = "https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds";

function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

function stripNicknames(s) {
  return String(s)
    .replace(/[""''„«»][^""''„«»]+[""''„«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(s) {
  return stripNicknames(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lastToken(s) {
  const parts = normalizeName(s).split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) {
    return false;
  }
  if (na === nb) {
    return true;
  }
  const la = lastToken(a);
  const lb = lastToken(b);
  if (la && lb && la === lb && la.length >= 4) {
    return true;
  }
  return na.includes(nb) || nb.includes(na);
}

function parseArgs(argv) {
  return {
    skipSnapshots: argv.includes("--skip-snapshots")
  };
}

function averageDecimalOddsForFighter(event, fighterName) {
  const target = normalizeName(fighterName);
  const prices = [];

  for (const bookmaker of event.bookmakers || []) {
    for (const market of bookmaker.markets || []) {
      if (market.key !== "h2h") {
        continue;
      }
      for (const outcome of market.outcomes || []) {
        if (normalizeName(outcome.name) === target) {
          const p = Number(outcome.price);
          if (Number.isFinite(p) && p > 1) {
            prices.push(p);
          }
        }
      }
    }
  }

  if (prices.length === 0) {
    return null;
  }

  return prices.reduce((sum, x) => sum + x, 0) / prices.length;
}

function tryMatchFightToEvent(fight, event) {
  const oh = averageDecimalOddsForFighter(event, event.home_team);
  const oa = averageDecimalOddsForFighter(event, event.away_team);
  if (oh == null || oa == null) {
    return null;
  }

  const fa = fight.fighterA.name;
  const fb = fight.fighterB.name;

  const homeMatchesA = namesMatch(event.home_team, fa);
  const awayMatchesB = namesMatch(event.away_team, fb);
  const homeMatchesB = namesMatch(event.home_team, fb);
  const awayMatchesA = namesMatch(event.away_team, fa);

  if (homeMatchesA && awayMatchesB) {
    return { oddsA: oh, oddsB: oa };
  }
  if (homeMatchesB && awayMatchesA) {
    return { oddsA: oa, oddsB: oh };
  }

  return null;
}

async function fetchOddsEvents(apiKey) {
  const params = new URLSearchParams({
    apiKey,
    regions: "eu",
    markets: "h2h",
    oddsFormat: "decimal"
  });

  const url = `${API_BASE}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`The Odds API HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = readEnv("ODDS_API_KEY", "").trim();
  if (!apiKey) {
    console.error("Set ODDS_API_KEY in .env");
    process.exit(1);
  }

  const events = await fetchOddsEvents(apiKey);
  console.log(`API returned ${events.length} MMA events with odds`);

  const fights = await prisma.fight.findMany({
    where: {
      status: "scheduled",
      event: {
        status: { in: ["upcoming", "live"] }
      }
    },
    include: {
      fighterA: true,
      fighterB: true,
      event: true
    }
  });

  let updated = 0;
  let skipped = 0;

  for (const fight of fights) {
    let matched = null;
    for (const ev of events) {
      const m = tryMatchFightToEvent(fight, ev);
      if (m) {
        matched = m;
        break;
      }
    }

    if (!matched) {
      skipped += 1;
      continue;
    }

    await prisma.fight.update({
      where: { id: fight.id },
      data: {
        oddsA: matched.oddsA,
        oddsB: matched.oddsB,
        oddsSource: "the-odds-api",
        oddsUpdatedAt: new Date()
      }
    });
    updated += 1;
    console.log(`[odds] ${fight.event.slug} | ${fight.fighterA.name} vs ${fight.fighterB.name} -> ${matched.oddsA.toFixed(2)} / ${matched.oddsB.toFixed(2)}`);
  }

  console.log("");
  console.log(`Updated: ${updated}`);
  console.log(`No API match: ${skipped}`);

  if (!options.skipSnapshots) {
    console.log("");
    console.log("Refreshing prediction snapshots...");
    execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "generate-prediction-snapshots.js")], {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    console.log("");
    console.log("Sending pending prediction push notifications...");
    execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "send-pending-push-notifications.js"), "--type", "predictions"], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
  }
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
