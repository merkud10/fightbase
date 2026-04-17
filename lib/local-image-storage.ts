import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveAppRoot } from "@/lib/paths";

const SHERDOG_HOSTS = new Set(["www1-cdn.sherdog.com"]);
const UFC_HOSTS = new Set(["ufc.com", "www.ufc.com", "media.ufc.tv", "dmxg5wxfqgb4u.cloudfront.net"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type ImageBucket = "articles" | "fighters";

interface PersistImageOptions {
  bucket: ImageBucket;
  key: string;
  sourceUrl: string | null | undefined;
}

function sanitizePathSegment(value: string) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "image"
  );
}

function normalizeExistingManagedUrl(value: string) {
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

function buildHeaders(target: URL) {
  const headers: Record<string, string> = {
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

function buildWeservUrl(source: URL) {
  const host = source.hostname;
  const pathWithQuery = `${source.pathname}${source.search}`;
  const target = `${host}${pathWithQuery}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(target)}`;
}

const RETRY_DELAYS_MS = [0, 2_000, 5_000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImageOnce(source: URL) {
  const directResponse = await fetch(source, {
    method: "GET",
    headers: buildHeaders(source),
    redirect: "follow",
    signal: AbortSignal.timeout(30_000)
  }).catch(() => null);

  if (directResponse?.ok) {
    return directResponse;
  }

  const weservUrl = buildWeservUrl(source);
  const weservResponse = await fetch(weservUrl, {
    method: "GET",
    headers: {
      "User-Agent": "FightBaseBot/1.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000)
  }).catch(() => null);

  if (weservResponse?.ok) {
    return weservResponse;
  }

  const directStatus = directResponse ? `direct HTTP ${directResponse.status}` : "direct request failed";
  const weservStatus = weservResponse ? `weserv HTTP ${weservResponse.status}` : "weserv request failed";
  throw new Error(`Image download failed (${directStatus}; ${weservStatus})`);
}

async function fetchImage(source: URL) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      return await fetchImageOnce(source);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Image fetch attempt ${attempt + 1}/${RETRY_DELAYS_MS.length} failed for ${source}: ${lastError.message}`);
    }
  }

  throw lastError ?? new Error(`Image download failed after ${RETRY_DELAYS_MS.length} attempts`);
}

function extensionFromContentType(contentType: string | null) {
  const [type = ""] = String(contentType || "").toLowerCase().split(";");
  const normalized = type.trim();

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

function extensionFromUrl(sourceUrl: string) {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const ext = path.extname(pathname).replace(/^\./, "");
    if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {}

  return "";
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function persistImageLocally(options: PersistImageOptions) {
  const rawSourceUrl = String(options.sourceUrl || "").trim();
  if (!rawSourceUrl) {
    return null;
  }

  const existingManagedUrl = normalizeExistingManagedUrl(rawSourceUrl);
  if (existingManagedUrl) {
    return existingManagedUrl;
  }

  let source: URL;
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
  const fileName = `${sanitizePathSegment(options.key)}-${createHash("sha256").update(source.toString()).digest("hex").slice(0, 12)}.${extension}`;
  const publicDir = path.join(resolveAppRoot(), "public", "media", options.bucket);
  const filePath = path.join(publicDir, fileName);
  const publicUrl = `/media/${options.bucket}/${fileName}`;

  if (await fileExists(filePath)) {
    return publicUrl;
  }

  await mkdir(publicDir, { recursive: true });
  await writeFile(filePath, buffer);

  return publicUrl;
}
