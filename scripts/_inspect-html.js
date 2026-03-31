const url = process.argv[2] || "https://fightnews.info/rezultaty-turnira-ufc-fight-night-271";

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&ndash;|&mdash;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const html = await resp.text();
  console.log(`Total HTML: ${html.length} chars\n`);

  // Find article body container
  const containers = [
    { name: "article", re: /<article[^>]*>([\s\S]*?)<\/article>/i },
    { name: "entry-content", re: /<div[^>]+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i },
    { name: "post-content", re: /<div[^>]+class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i },
    { name: "article-body", re: /<div[^>]+class="[^"]*article[_-]?body[^"]*"[^>]*>([\s\S]*?)<\/div>/i },
  ];

  for (const c of containers) {
    const m = html.match(c.re);
    if (m) {
      console.log(`Container "${c.name}" found: ${m[0].length} chars`);
    }
  }

  // Show ALL tags with content in the article area
  console.log("\n=== All <p>, <li>, <h2>, <h3>, <strong>, <br> structure ===\n");
  
  // Find the article content area - look for the article text
  const startMarker = html.indexOf("Climate Pledge Arena");
  if (startMarker < 0) { console.log("Content marker not found"); return; }
  
  const chunk = html.slice(Math.max(0, startMarker - 500), startMarker + 8000);
  
  // Show raw HTML structure
  console.log("=== RAW HTML around article content (first 4000 chars) ===\n");
  console.log(chunk.slice(0, 4000));
  
  console.log("\n\n=== All <p> tags ===\n");
  const pTags = [...chunk.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  for (let i = 0; i < pTags.length; i++) {
    const raw = pTags[i][1];
    const text = decodeHtml(raw.replace(/<[^>]+>/g, " "));
    console.log(`[p${i}] (${text.length} chars) ${text.slice(0, 150)}`);
  }

  console.log("\n=== All <li> tags ===\n");
  const liTags = [...chunk.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  for (let i = 0; i < liTags.length; i++) {
    const text = decodeHtml(liTags[i][1].replace(/<[^>]+>/g, " "));
    console.log(`[li${i}] (${text.length} chars) ${text.slice(0, 150)}`);
  }
}

main().catch(console.error);
