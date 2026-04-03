import { prisma } from "@/lib/prisma";

type PublishTarget = "telegram" | "vk";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function buildArticleUrl(slug: string, category: string) {
  const basePath = category === "analysis" ? "/ru/analysis" : "/ru/news";
  return `${getSiteUrl()}${basePath}/${slug}`;
}

function truncateText(value: string, maxLength = 220) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function escapeTelegram(value: string) {
  return String(value || "").replace(/[&<>]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
}

export async function getPublishableArticle(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      category: true,
      status: true,
      telegramPostedAt: true,
      vkPostedAt: true
    }
  });
}

function buildTelegramMessage(article: { title: string; excerpt: string; slug: string; category: string }) {
  const url = buildArticleUrl(article.slug, article.category);
  const excerpt = truncateText(article.excerpt, 260);

  return [
    `<b>${escapeTelegram(article.title)}</b>`,
    "",
    escapeTelegram(excerpt),
    "",
    `<a href="${url}">Читать на FightBase</a>`
  ].join("\n");
}

function buildVkMessage(article: { title: string; excerpt: string; slug: string; category: string }) {
  const url = buildArticleUrl(article.slug, article.category);
  const excerpt = truncateText(article.excerpt, 260);

  return `${article.title}\n\n${excerpt}\n\nЧитать: ${url}`;
}

export async function publishArticleToTelegram(articleId: string) {
  const article = await getPublishableArticle(articleId);

  if (!article) {
    throw new Error("Article not found.");
  }

  if (article.status !== "published") {
    throw new Error("Only published articles can be sent to Telegram.");
  }

  if (article.telegramPostedAt) {
    throw new Error("This article has already been sent to Telegram.");
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !chatId) {
    throw new Error("Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: buildTelegramMessage(article),
      parse_mode: "HTML",
      disable_web_page_preview: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${text}`);
  }

  await prisma.article.update({
    where: { id: article.id },
    data: {
      telegramPostedAt: new Date()
    }
  });

  return article;
}

export async function publishArticleToVk(articleId: string) {
  const article = await getPublishableArticle(articleId);

  if (!article) {
    throw new Error("Article not found.");
  }

  if (article.status !== "published") {
    throw new Error("Only published articles can be sent to VK.");
  }

  if (article.vkPostedAt) {
    throw new Error("This article has already been sent to VK.");
  }

  const token = process.env.VK_GROUP_TOKEN;
  const groupId = process.env.VK_GROUP_ID;
  const apiVersion = process.env.VK_API_VERSION || "5.199";

  if (!token || !groupId) {
    throw new Error("VK is not configured. Set VK_GROUP_TOKEN and VK_GROUP_ID.");
  }

  const url = new URL("https://api.vk.com/method/wall.post");
  url.searchParams.set("access_token", token);
  url.searchParams.set("v", apiVersion);
  url.searchParams.set("owner_id", `-${String(groupId).replace(/^-+/, "")}`);
  url.searchParams.set("from_group", "1");
  url.searchParams.set("message", buildVkMessage(article));

  const response = await fetch(url, {
    method: "POST"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`VK API error: ${response.status} ${text}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`VK API error: ${payload.error.error_msg || "Unknown error"}`);
  }

  await prisma.article.update({
    where: { id: article.id },
    data: {
      vkPostedAt: new Date()
    }
  });

  return article;
}

export type { PublishTarget };
