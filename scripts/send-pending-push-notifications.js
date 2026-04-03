#!/usr/bin/env node

const webpush = require("web-push");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const options = {
    type: "all",
    limit: 20,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--type" && argv[index + 1]) {
      options.type = String(argv[index + 1]).trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Math.max(1, Number(argv[index + 1]) || options.limit);
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function normalizeLocale(locale) {
  return String(locale || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function truncateText(value, maxLength = 140) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildLocalizedUrl(locale, pathName) {
  return `${getSiteUrl()}/${locale}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
}

function buildArticleNotification(article, locale) {
  const isRussian = locale === "ru";
  const prefix =
    article.category === "analysis"
      ? isRussian
        ? "Новая аналитика UFC"
        : "New UFC analysis"
      : isRussian
        ? "Новая новость UFC"
        : "New UFC story";

  const urlBase = article.category === "analysis" ? "/analysis" : "/news";

  return {
    title: article.title,
    body: truncateText(article.excerpt || prefix, 160),
    url: buildLocalizedUrl(locale, `${urlBase}/${article.slug}`),
    icon: "/gorilla-crown-logo.png",
    badge: "/gorilla-crown-logo.png",
    tag: `article-${article.id}`
  };
}

function buildPredictionNotification(snapshot, locale) {
  const fighterA = locale === "ru" ? snapshot.fight.fighterA.nameRu || snapshot.fight.fighterA.name : snapshot.fight.fighterA.name;
  const fighterB = locale === "ru" ? snapshot.fight.fighterB.nameRu || snapshot.fight.fighterB.name : snapshot.fight.fighterB.name;
  const title = locale === "ru" ? `${fighterA} — ${fighterB}: новый прогноз` : `New prediction: ${fighterA} vs ${fighterB}`;
  const body = locale === "ru"
    ? truncateText(snapshot.excerptRu || snapshot.headlineRu, 160)
    : truncateText(snapshot.excerptEn || snapshot.headlineEn, 160);

  return {
    title,
    body,
    url: buildLocalizedUrl(locale, `/predictions/${snapshot.event.slug}/${snapshot.fightId}`),
    icon: "/gorilla-crown-logo.png",
    badge: "/gorilla-crown-logo.png",
    tag: `prediction-${snapshot.id}`
  };
}

async function getActiveSubscriptions() {
  return prisma.browserPushSubscription.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" }
  });
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:push@fightbase.local";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

async function sendPayloadToSubscriptions(payload, subscriptions, dryRun) {
  let delivered = 0;
  let deactivated = 0;

  for (const subscription of subscriptions) {
    if (dryRun) {
      delivered += 1;
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: null,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        JSON.stringify(payload)
      );
      delivered += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);

      if (statusCode === 404 || statusCode === 410) {
        await prisma.browserPushSubscription.update({
          where: { id: subscription.id },
          data: {
            isActive: false,
            lastSeenAt: new Date()
          }
        });
        deactivated += 1;
        continue;
      }

      console.warn(`[push] failed for subscription ${subscription.id}: ${error?.message || error}`);
    }
  }

  return { delivered, deactivated };
}

async function loadPendingArticles(limit) {
  return prisma.article.findMany({
    where: {
      status: "published",
      category: {
        in: ["news", "analysis"]
      },
      browserPushNotifiedAt: null
    },
    orderBy: [{ publishedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      category: true
    }
  });
}

async function loadPendingPredictions(limit) {
  return prisma.fightPredictionSnapshot.findMany({
    where: {
      browserPushNotifiedAt: null
    },
    orderBy: [{ generatedAt: "asc" }, { updatedAt: "asc" }],
    take: limit,
    select: {
      id: true,
      fightId: true,
      event: {
        select: {
          slug: true
        }
      },
      fight: {
        select: {
          fighterA: {
            select: {
              name: true,
              nameRu: true
            }
          },
          fighterB: {
            select: {
              name: true,
              nameRu: true
            }
          }
        }
      },
      headlineRu: true,
      headlineEn: true,
      excerptRu: true,
      excerptEn: true
    }
  });
}

async function markArticlesNotified(articleIds, dryRun) {
  if (dryRun || articleIds.length === 0) {
    return;
  }

  await prisma.article.updateMany({
    where: {
      id: {
        in: articleIds
      }
    },
    data: {
      browserPushNotifiedAt: new Date()
    }
  });
}

async function markPredictionsNotified(snapshotIds, dryRun) {
  if (dryRun || snapshotIds.length === 0) {
    return;
  }

  await prisma.fightPredictionSnapshot.updateMany({
    where: {
      id: {
        in: snapshotIds
      }
    },
    data: {
      browserPushNotifiedAt: new Date()
    }
  });
}

async function processArticles(subscriptions, options) {
  const articles = await loadPendingArticles(options.limit);
  const articleIds = [];
  let delivered = 0;
  let deactivated = 0;

  for (const article of articles) {
    const localeGroups = new Map();

    for (const subscription of subscriptions) {
      const locale = normalizeLocale(subscription.locale);
      if (!localeGroups.has(locale)) {
        localeGroups.set(locale, []);
      }
      localeGroups.get(locale).push(subscription);
    }

    for (const [locale, localeSubscriptions] of localeGroups.entries()) {
      const stats = await sendPayloadToSubscriptions(
        buildArticleNotification(article, locale),
        localeSubscriptions,
        options.dryRun
      );
      delivered += stats.delivered;
      deactivated += stats.deactivated;
    }

    articleIds.push(article.id);
    console.log(`[push] article ${article.slug}`);
  }

  await markArticlesNotified(articleIds, options.dryRun);

  return { count: articles.length, delivered, deactivated };
}

async function processPredictions(subscriptions, options) {
  const snapshots = await loadPendingPredictions(options.limit);
  const snapshotIds = [];
  let delivered = 0;
  let deactivated = 0;

  for (const snapshot of snapshots) {
    const localeGroups = new Map();

    for (const subscription of subscriptions) {
      const locale = normalizeLocale(subscription.locale);
      if (!localeGroups.has(locale)) {
        localeGroups.set(locale, []);
      }
      localeGroups.get(locale).push(subscription);
    }

    for (const [locale, localeSubscriptions] of localeGroups.entries()) {
      const stats = await sendPayloadToSubscriptions(
        buildPredictionNotification(snapshot, locale),
        localeSubscriptions,
        options.dryRun
      );
      delivered += stats.delivered;
      deactivated += stats.deactivated;
    }

    snapshotIds.push(snapshot.id);
    console.log(`[push] prediction ${snapshot.event.slug}/${snapshot.fightId}`);
  }

  await markPredictionsNotified(snapshotIds, options.dryRun);

  return { count: snapshots.length, delivered, deactivated };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supportedTypes = new Set(["all", "articles", "predictions"]);

  if (!supportedTypes.has(options.type)) {
    throw new Error(`Unsupported --type value: ${options.type}`);
  }

  const configured = configureWebPush();
  const subscriptions = await getActiveSubscriptions();

  if (!configured) {
    console.log("[push] VAPID keys are missing, skipping browser push sending.");
    process.exit(0);
  }

  let articleStats = { count: 0, delivered: 0, deactivated: 0 };
  let predictionStats = { count: 0, delivered: 0, deactivated: 0 };

  if (options.type === "all" || options.type === "articles") {
    articleStats = await processArticles(subscriptions, options);
  }

  if (options.type === "all" || options.type === "predictions") {
    predictionStats = await processPredictions(subscriptions, options);
  }

  console.log("");
  console.log(`Active subscriptions: ${subscriptions.length}`);
  console.log(`Articles notified: ${articleStats.count}`);
  console.log(`Predictions notified: ${predictionStats.count}`);
  console.log(`Push deliveries attempted: ${articleStats.delivered + predictionStats.delivered}`);
  console.log(`Subscriptions deactivated: ${articleStats.deactivated + predictionStats.deactivated}`);
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
