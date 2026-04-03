const HOTLINK_PROTECTED_HOSTS = new Set(["www1-cdn.sherdog.com"]);

export function getDisplayImageUrl(url?: string | null) {
  const raw = String(url || "").trim();

  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (HOTLINK_PROTECTED_HOSTS.has(parsed.hostname)) {
      return `/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}
