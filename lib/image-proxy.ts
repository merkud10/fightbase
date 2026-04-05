/**
 * Все внешние картинки проксируем через /api/image-proxy,
 * чтобы обойти блокировки и hotlink-protection.
 */
export function getDisplayImageUrl(url?: string | null) {
  const raw = String(url || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return `/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
    }
    return raw;
  } catch {
    return raw;
  }
}
