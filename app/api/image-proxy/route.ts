import { NextResponse } from "next/server";

const SHERDOG_HOSTS = new Set(["www1-cdn.sherdog.com"]);

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
        "Cache-Control": "public, max-age=86400, s-maxage=86400"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to proxy image" },
      { status: 502 }
    );
  }
}
