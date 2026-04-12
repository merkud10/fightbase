#!/usr/bin/env node

const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const path = require("node:path");

const prisma = new PrismaClient();

function readEnvValueFromFile(name) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const contents = fs.readFileSync(envPath, "utf8");
    const match = contents.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?$`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function readEnv(name, fallback = "") {
  return process.env[name] || readEnvValueFromFile(name) || fallback;
}

async function main() {
  const siteUrl = readEnv("NEXT_PUBLIC_SITE_URL", "https://fightbase.ru");
  console.log(`Site URL: ${siteUrl}\n`);

  const articles = await prisma.article.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      telegramPostedAt: true
    }
  });

  console.log(`=== Last 5 published articles ===\n`);

  for (const a of articles) {
    const raw = a.coverImageUrl || "(null)";
    console.log(`  Title: ${a.title?.slice(0, 60)}...`);
    console.log(`  coverImageUrl: ${raw}`);
    console.log(`  telegramPostedAt: ${a.telegramPostedAt || "(not sent)"}`);

    if (raw.startsWith("/media/")) {
      const filePath = path.join(process.cwd(), "public", raw.replace(/^\//, ""));
      const exists = fs.existsSync(filePath);
      console.log(`  Local file exists: ${exists} (${filePath})`);

      const fullUrl = `${siteUrl}${raw}`;
      console.log(`  Public URL: ${fullUrl}`);

      try {
        const resp = await fetch(fullUrl, { method: "HEAD", signal: AbortSignal.timeout(10000) });
        console.log(`  HTTP HEAD status: ${resp.status}`);
      } catch (e) {
        console.log(`  HTTP HEAD failed: ${e.message}`);
      }
    } else if (raw.startsWith("/api/image-proxy")) {
      console.log(`  Type: image-proxy (old format)`);
    } else if (raw.startsWith("http")) {
      console.log(`  Type: external URL`);
    }

    console.log();
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
