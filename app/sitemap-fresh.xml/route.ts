import { getFreshPages } from "@/lib/fresh-pages";
import { getSiteUrl } from "@/lib/site";
import { buildSitemapXml } from "@/lib/sitemap-xml";

// Маленькая карта свежих страниц для Google: IndexNow он не поддерживает, а большой
// sitemap.xml с тысячами карточек бойцов перечитывает реже. Сюда идут статьи,
// прогнозы и турниры за последние 3 дня и все ближайшие турниры.
export const revalidate = 900;

const FRESH_DAYS = 3;

export async function GET() {
  const siteUrl = getSiteUrl().toString().replace(/\/$/, "");
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000);
  const pages = await getFreshPages(since, { includeUpcomingEvents: true });
  const xml = buildSitemapXml(pages.map((page) => ({ url: `${siteUrl}/ru${page.path}`, lastModified: page.lastModified })));

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=900"
    }
  });
}
