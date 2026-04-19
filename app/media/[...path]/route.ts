import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { resolvePublicPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_BUCKETS = new Set(["articles", "fighters"]);

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;

  if (!segments || segments.length < 2) {
    return new NextResponse(null, { status: 404 });
  }

  const [bucket, ...rest] = segments;
  if (!bucket || !ALLOWED_BUCKETS.has(bucket)) {
    return new NextResponse(null, { status: 404 });
  }

  const mediaRoot = resolvePublicPath("media");
  const resolved = path.resolve(mediaRoot, bucket, ...rest);
  if (!resolved.startsWith(mediaRoot + path.sep)) {
    return new NextResponse(null, { status: 404 });
  }

  let fileStat;
  try {
    fileStat = await stat(resolved);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!fileStat.isFile()) {
    return new NextResponse(null, { status: 404 });
  }

  const extension = path.extname(resolved).toLowerCase();
  const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
  const etag = `"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`;

  const stream = Readable.toWeb(createReadStream(resolved)) as unknown as ReadableStream;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": fileStat.size.toString(),
      "Cache-Control": "public, max-age=2592000, immutable",
      "Last-Modified": new Date(fileStat.mtimeMs).toUTCString(),
      ETag: etag
    }
  });
}
