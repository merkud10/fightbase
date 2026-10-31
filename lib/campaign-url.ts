// Use only for inbound links in external publications, never internal navigation.
export function buildCampaignUrl(url: string, source: "telegram" | "vk", campaign: string): string {
  const result = new URL(url);
  result.searchParams.set("utm_source", source);
  result.searchParams.set("utm_medium", "social");
  result.searchParams.set("utm_campaign", campaign);
  return result.toString();
}
