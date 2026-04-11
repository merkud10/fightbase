const { createHash } = require("node:crypto");
const { mkdirSync, existsSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const SHERDOG_HOSTS = new Set(["www1-cdn.sherdog.com"]);
const UFC_HOSTS = new Set(["ufc.com", "www.ufc.com", "media.ufc.tv", "dmxg5wxfqgb4u.cloudfront.net"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function sanitizePathSegment(value) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "image"
  );
}

function normalizeExistingManagedUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("/media/")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/media/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {}

  return null;
}

function buildHeaders(target) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8"
  };

  if (SHERDOG_HOSTS.has(target.hostname)) {
    headers.Referer = "https://www.sherdog.com/";
  } else if (UFC_HOSTS.has(target.hostname)) {
    headers.Referer = "https://www.ufc.com/";
    headers.Origin = "https://www.ufc.com";
    headers.Accept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  }

  return headers;
}

function buildWeservUrl(source) {
  const target = `${source.hostname}${source.pathname}${source.search}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(target)}`;
}

async function fetchImage(source) {
  const directResponse = await fetch(source, {
    method: "GET",
    headers: buildHeaders(source),
    redirect: "follow"
  }).catch(() => null);

  if (directResponse && directResponse.ok) {
    return directResponse;
  }

  const weservUrl = buildWeservUrl(source);
  const weservResponse = await fetch(weservUrl, {
    method: "GET",
    headers: {
      "User-Agent": "FightBaseBot/1.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    },
    redirect: "follow"
  }).catch(() => null);

  if (weservResponse && weservResponse.ok) {
    return weservResponse;
  }

  const directStatus = directResponse ? `direct HTTP ${directResponse.status}` : "direct request failed";
  const weservStatus = weservResponse ? `weserv HTTP ${weservResponse.status}` : "weserv request failed";
  throw new Error(`Image download failed (${directStatus}; ${weservStatus})`);
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase().split(";")[0].trim();

  switch (normalized) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "image/svg+xml":
      return "svg";
    default:
      return "";
  }
}

function extensionFromUrl(sourceUrl) {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const ext = path.extname(pathname).replace(/^\./, "");
    if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {}

  return "";
}

async function persistImageLocally({ bucket, key, sourceUrl }) {
  const rawSourceUrl = String(sourceUrl || "").trim();
  if (!rawSourceUrl) {
    return null;
  }

  const existingManagedUrl = normalizeExistingManagedUrl(rawSourceUrl);
  if (existingManagedUrl) {
    return existingManagedUrl;
  }

  let source;
  try {
    source = new URL(rawSourceUrl);
  } catch {
    return null;
  }

  const response = await fetchImage(source);

  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unsupported image content-type: ${contentType || "unknown"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Image download returned empty body");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`);
  }

  const extension = extensionFromContentType(contentType) || extensionFromUrl(source.toString()) || "jpg";
  const fileName = `${sanitizePathSegment(key)}-${createHash("sha256").update(source.toString()).digest("hex").slice(0, 12)}.${extension}`;
  const publicDir = path.join(process.cwd(), "public", "media", bucket);
  const filePath = path.join(publicDir, fileName);
  const publicUrl = `/media/${bucket}/${fileName}`;

  if (existsSync(filePath)) {
    return publicUrl;
  }

  mkdirSync(publicDir, { recursive: true });
  writeFileSync(filePath, buffer);

  return publicUrl;
}

module.exports = {
  persistImageLocally
};
