import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { dripPublishNextArticle } from "@/lib/social-publish";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:drip-social",
      limit: 10,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const result = await dripPublishNextArticle();

    if (!result) {
      logger.info("Drip social: no articles pending", authorization.context);
      return NextResponse.json({ ok: true, published: false, message: "No articles pending social publish." });
    }

    logger.info("Drip social: published article", {
      ...authorization.context,
      articleId: result.articleId,
      telegram: result.telegram,
      vk: result.vk
    });

    return NextResponse.json({
      ok: true,
      published: true,
      articleId: result.articleId,
      title: result.title,
      telegram: result.telegram,
      vk: result.vk
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drip social publish failed";
    logger.error("Drip social failed", { ...authorization.context, error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
