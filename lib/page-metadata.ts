import type { Metadata } from "next";

import type { Locale } from "@/lib/locale-config";
import { buildLocaleAlternates, localizePath } from "@/lib/locale-path";
import { ogImageUrl } from "@/lib/seo";

type PageMetadataInput = {
  locale: Locale;
  path: string;
  title: string;
  description: string;
};

export function buildPageMetadata({ locale, path, title, description }: PageMetadataInput): Metadata {
  const canonical = localizePath(path, locale);
  const image = ogImageUrl();

  return {
    title,
    description,
    alternates: {
      ...buildLocaleAlternates(path),
      canonical
    },
    openGraph: {
      type: "website",
      locale: locale === "ru" ? "ru_RU" : "en_US",
      url: canonical,
      siteName: "FightBase Media",
      title,
      description,
      images: [image]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image]
    }
  };
}
