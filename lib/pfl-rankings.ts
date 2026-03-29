export type PflOfficialRankingRow = {
  rank: number;
  name: string;
  imageUrl: string | null;
  movement: string | null;
};

export type PflOfficialRankingGroup = {
  title: string;
  champion: {
    name: string;
    imageUrl: string | null;
    isChampion: boolean;
  };
  rows: PflOfficialRankingRow[];
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
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function parseMovement(rowHtml: string) {
  const movementNumber = stripHtml((rowHtml.match(/<span class="movement-num">([\s\S]*?)<\/span>/i) || [])[1] || "");
  const arrowClass = (rowHtml.match(/movement-arrow\s+([a-z-]+)/i) || [])[1] || "";

  if (!movementNumber) {
    return null;
  }

  if (/positive/i.test(arrowClass)) {
    return `+${movementNumber}`;
  }

  if (/negative/i.test(arrowClass)) {
    return `-${movementNumber}`;
  }

  return movementNumber;
}

function parseRankingRows(sectionHtml: string) {
  return [...sectionHtml.matchAll(/<div class="ranking-line d-flex align-items-center my-2">([\s\S]*?)<\/div>\s*<\/div>/gi)]
    .map((match) => {
      const rowHtml = match[1];
      const rank = Number(stripHtml((rowHtml.match(/<div class="black-box[\s\S]*?<span>([\s\S]*?)<\/span>/i) || [])[1] || ""));
      const imageUrl = (rowHtml.match(/<img[^>]+src="([^"]+)"[^>]+alt="[^"]+"/i) || [])[1] || null;
      const name = stripHtml((rowHtml.match(/<h6 class="mb-0">([\s\S]*?)<\/h6>/i) || [])[1] || "");
      const movement = parseMovement(rowHtml);

      if (!rank || !name) {
        return null;
      }

      return {
        rank,
        name,
        imageUrl,
        movement
      };
    })
    .filter((row): row is PflOfficialRankingRow => row !== null);
}

export async function fetchPflOfficialRankings(): Promise<PflOfficialRankingGroup[]> {
  const response = await fetch("https://pflmma.com/rankings", {
    headers: {
      "user-agent": "Mozilla/5.0 FightBase/1.0"
    },
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    throw new Error(`Failed to load PFL rankings: ${response.status}`);
  }

  const html = await response.text();

  const blocks = html
    .split('<div class="col-lg-3 col-md-4 mb-md-5">')
    .slice(1)
    .map((block) => block.split('<div class="col-lg-3 col-md-4 mb-md-5">')[0] || block);

  return blocks
    .map((boxHtml) => {
      const title = stripHtml((boxHtml.match(/<h5[^>]*>([\s\S]*?)<i class=/i) || [])[1] || "").replace(/\s+$/g, "");
      const championName = stripHtml((boxHtml.match(/<h4 class="mb-2">([\s\S]*?)<\/h4>/i) || [])[1] || "");
      const championImage = (boxHtml.match(/<img class="fighter-bodyshot" src="([^"]+)"/i) || [])[1] || null;
      const isChampion = /CHAMPION/i.test(boxHtml);
      const rankingsList = (boxHtml.match(/<div class="rankings-list">([\s\S]*?)$/i) || [])[1] || "";
      const rows = parseRankingRows(rankingsList);

      if (!title || !championName || rows.length === 0) {
        return null;
      }

      return {
        title,
        champion: {
          name: championName,
          imageUrl: championImage,
          isChampion
        },
        rows
      };
    })
    .filter((group): group is PflOfficialRankingGroup => group !== null)
    .filter((group) => !/women/i.test(group.title));
}
