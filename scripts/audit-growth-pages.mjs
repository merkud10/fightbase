// Read-only baseline selected from the visible Search Console report on 2026-10-31.
import { mkdir, writeFile } from "node:fs/promises";
const rows = [
  ["/ru/fighters/damian-pinas",16,7,8222,2120],
  ["/ru/fighters/mike-malott",5,0,6400,259],
  ["/ru/fighters/farid-basharat",5,1,5256,120],
  ["/ru/fighters/merab-dvalishvili",2,0,5031,55],
  ["/ru/fighters/kody-steele",9,0,4330,133],
  ["/ru/fighters/grant-dawson",36,4,4288,789],
  ["/ru/fighters/michael-morales",3,0,2923,0],
  ["/ru/fighters/movsar-evloev",9,0,2525,0],
  ["/ru/fighters/payton-talbott",4,1,2397,675],
  ["/ru/fighters/joshua-van",0,4,2295,14806],
  ["/ru/rankings/welterweight",12,0,2981,540],
  ["/ru/predictions",49,18,2290,2024],
  ["/ru/events/ufc-335",78,107,4386,7217],
  ["/ru/events/ufc-335-oliveira-vs-lopes",40,0,6246,0],
  ["/ru/compare/dzhek-della-maddalena-vs-yaroslav-amosov",26,161,463,1681]
];
const results = [];
for (let start = 0; start < rows.length; start += 3) {
  results.push(...await Promise.all(rows.slice(start, start + 3).map(async ([path, clicks, previousClicks, impressions, previousImpressions]) => {
    const result = { path, clicks, previousClicks, impressions, previousImpressions, ctr: +(100 * clicks / impressions).toFixed(2) };
    try {
      const first = await fetch(`https://fightbase.ru${path}`, { redirect: "manual", signal: AbortSignal.timeout(30000) });
      const location = first.headers.get("location");
      const response = location ? await fetch(new URL(location, `https://fightbase.ru${path}`), { signal: AbortSignal.timeout(30000) }) : first;
      const html = await response.text();
      const value = pattern => html.match(pattern)?.[1] ?? null;
      return { ...result, firstStatus: first.status, location, status: response.status, finalUrl: response.url,
        title: value(/<title>(.*?)<\/title>/s), canonical: value(/<link rel="canonical" href="([^"]*)/),
        description: value(/<meta name="description" content="([^"]*)/),
        h1: value(/<h1\b[^>]*>(.*?)<\/h1>/s)?.replace(/<[^>]+>/g, ""),
        h1Count: [...html.matchAll(/<h1\b/g)].length,
        robots: value(/<meta name="robots" content="([^"]*)/)
      };
    } catch (error) { return { ...result, error: error.message }; }
  })));
}
const directory = "docs/audits/2026-10-31";
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/growth-pages.json`, JSON.stringify({ checkedAt: new Date().toISOString(),
  currentPeriod: ["2026-10-02", "2026-10-29"], previousPeriod: ["2026-09-04", "2026-10-01"],
  note: "GSC metrics transcribed from the live UI; CTR calculated. Selected by impressions and changes, not by page-level position (not extracted). HTTP checks do not establish factual accuracy of content.", results }, null, 2));
console.log(JSON.stringify(results.map(({path,firstStatus,status,location,canonical,title,error})=>({path,firstStatus,status,location,canonical,title,error})), null, 2));
