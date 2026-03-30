export function getSiteUrl() {
  const candidate = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

  try {
    return new URL(candidate);
  } catch {
    return new URL("http://localhost:3000");
  }
}
