function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Минимальный <urlset> для маршрутов, которые Next не собирает сам (sitemap-fresh.xml).
// Самые свежие адреса идут первыми.
export function buildSitemapXml(entries: { url: string; lastModified: Date }[]) {
  const items = [...entries]
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    .map((entry) => `<url><loc>${escapeXml(entry.url)}</loc><lastmod>${entry.lastModified.toISOString()}</lastmod></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}
