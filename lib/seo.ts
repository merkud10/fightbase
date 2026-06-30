import { isUsablePhoto } from "@/lib/display";
import { getSiteUrl } from "@/lib/site";
import { toAbsoluteUrl, toSearchImageUrl } from "@/lib/structured-data";

// Default share image used when a page has no representative photo. Lives in
// public/.
export const DEFAULT_OG_IMAGE_PATH = "/gorilla-crown-logo.png";

function siteOrigin() {
  return getSiteUrl().toString().replace(/\/$/, "");
}

// Returns an absolute, social-friendly (JPEG for AVIF/WebP sources) image URL
// for use in openGraph.images / twitter.images. Falls back to the branded
// default when the source photo is missing or a placeholder/silhouette.
export function ogImageUrl(sourceUrl?: string | null) {
  const origin = siteOrigin();
  if (isUsablePhoto(sourceUrl)) {
    return toSearchImageUrl(toAbsoluteUrl(String(sourceUrl), origin));
  }
  return `${origin}${DEFAULT_OG_IMAGE_PATH}`;
}

// Clamp a meta description to a search-friendly length, cutting on a word
// boundary and appending an ellipsis. Google typically renders ~155-160 chars.
export function clampDescription(text: string, max = 160) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  const slice = normalized.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).replace(/[\s.,:;—-]+$/, "");
  return `${trimmed}…`;
}
