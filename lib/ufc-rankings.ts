type UfcOfficialRankingRow = {
  rank: number;
  name: string;
  officialSlug: string;
  badge: string | null;
};

export type UfcOfficialRankingGroup = {
  title: string;
  champion: {
    name: string;
    officialSlug: string;
    imageUrl: string | null;
  };
  rows: UfcOfficialRankingRow[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function normalizeDivisionTitle(value: string) {
  return stripHtml(value.replace(/\s+Top Rank$/i, ""));
}

function parseRankingRows(sectionHtml: string): UfcOfficialRankingRow[] {
  const rows = [...sectionHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)]
    .map((match) => {
      const rowHtml = match[1];
      const rankMatch = rowHtml.match(/views-field-weight-class-rank">\s*([^<]+)\s*<\/td>/i);
      const fighterMatch = rowHtml.match(/<a[^>]*href="\/athlete\/([^"]+)"[^>]*>([^<]+)<\/a>/i);
      const badgeMatch = rowHtml.match(/views-field-weight-class-rank-change">\s*([\s\S]*?)\s*<\/td>/i);

      if (!rankMatch || !fighterMatch) {
        return null;
      }

      const badgeText = stripHtml(badgeMatch?.[1] || "");

      return {
        rank: Number(rankMatch[1].trim()),
        officialSlug: fighterMatch[1].trim(),
        name: decodeHtml(fighterMatch[2].trim()),
        badge: badgeText || null
      };
    })
    .filter((row): row is UfcOfficialRankingRow => row !== null)
    .filter((row) => Number.isFinite(row.rank));

  return rows;
}

export async function fetchUfcOfficialRankings(): Promise<UfcOfficialRankingGroup[]> {
  const response = await fetch("https://www.ufc.com/rankings", {
    headers: {
      "user-agent": "Mozilla/5.0 FightBase/1.0"
    },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    throw new Error(`Failed to load UFC rankings: ${response.status}`);
  }

  const html = await response.text();
  const groupingMatches = [
    ...html.matchAll(
      /<div class="view-grouping-header">([\s\S]*?)<\/div>\s*<div class="view-grouping-content"><table class="cols-0">([\s\S]*?)<\/table>/gi
    )
  ];

  const parsedGroups = groupingMatches
    .map((match) => {
      const title = normalizeDivisionTitle(match[1]);
      const sectionHtml = match[2];

      const championMatch = sectionHtml.match(
        /<h5><a href="\/athlete\/([^"]+)"[^>]*>([^<]+)<\/a><\/h5>[\s\S]*?<img src="([^"]+)"/i
      );

      if (!championMatch) {
        return null;
      }

      const rows = parseRankingRows(sectionHtml);

      return {
        title,
        champion: {
          officialSlug: championMatch[1].trim(),
          name: decodeHtml(championMatch[2].trim()),
          imageUrl: championMatch[3]?.trim() || null
        },
        rows
      };
    })
    .filter((group): group is UfcOfficialRankingGroup => group !== null)
    .filter((group) => !/pound-for-pound/i.test(group.title));

  return parsedGroups;
}
