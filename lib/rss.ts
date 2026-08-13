type RssChannel = {
  title: string;
  link: string;
  description: string;
  language: string;
  selfUrl: string;
};

export type RssItem = {
  title: string;
  link: string;
  pubDate: Date;
  description?: string | null;
  category?: string | null;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderItem(item: RssItem) {
  const parts = [
    `<title>${escapeXml(item.title)}</title>`,
    `<link>${escapeXml(item.link)}</link>`,
    `<guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
    `<pubDate>${item.pubDate.toUTCString()}</pubDate>`
  ];

  if (item.description) {
    parts.push(`<description>${escapeXml(item.description)}</description>`);
  }

  if (item.category) {
    parts.push(`<category>${escapeXml(item.category)}</category>`);
  }

  return `<item>${parts.join("")}</item>`;
}

export function buildRssXml(channel: RssChannel, items: RssItem[]) {
  const lastBuildDate = items[0]?.pubDate ?? new Date();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.link)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    `<language>${escapeXml(channel.language)}</language>`,
    `<lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`,
    `<atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml"/>`,
    ...items.map(renderItem),
    "</channel>",
    "</rss>"
  ].join("");
}
