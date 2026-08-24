import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  const canonicalHost = siteUrl.toString().replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        // Фото бойцов отдаются через /api/image-proxy: под общий запрет /api они
        // попадать не должны, иначе карточки выпадают из Google Картинок.
        allow: ["/", "/api/image-proxy"],
        disallow: ["/admin", "/api"]
      }
    ],
    sitemap: `${canonicalHost}/sitemap.xml`,
    host: canonicalHost
  };
}
