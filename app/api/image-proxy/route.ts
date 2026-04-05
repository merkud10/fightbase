import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { recordSystemEvent } from "@/lib/system-events";

const SHERDOG_HOSTS = new Set(["www1-cdn.sherdog.com"]);
const UFC_HOSTS = new Set(["ufc.com", "www.ufc.com", "media.ufc.tv"]);

function isPrivateHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.")
  );
}

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, {
    rateLimit: {
      scope: "api:image-proxy",
      limit: 180,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url") || "";

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol) || isPrivateHostname(target.hostname)) {
    return NextResponse.json({ error: "Unsupported image URL" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "User-Agent": "FightBaseBot/1.0"
  };

  if (SHERDOG_HOSTS.has(target.hostname)) {
    headers.Referer = "https://www.sherdog.com/";
  } else if (UFC_HOSTS.has(target.hostname)) {
    headers.Referer = "https://www.ufc.com/";
    headers["Accept"] = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers,
      redirect: "follow"
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream returned HTTP ${upstream.status}` }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Upstream resource is not an image" }, { status: 415 });
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "x-request-id": authorization.context.requestId
      }
    });
  } catch (error) {
    logger.error("Image proxy failed", {
      ...authorization.context,
      targetUrl: rawUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    void recordSystemEvent({
      level: "error",
      category: "api.image_proxy",
      message: "Image proxy failed",
      source: "api/image-proxy",
      requestId: authorization.context.requestId,
      path: authorization.context.path,
      ipAddress: authorization.context.ip,
      meta: {
        targetUrl: rawUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to proxy image" },
      {
        status: 502,
        headers: {
          "x-request-id": authorization.context.requestId
        }
      }
    );
  }
}
