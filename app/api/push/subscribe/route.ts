import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { SaveBrowserPushInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    rateLimit: {
      scope: "api:push:subscribe",
      limit: 20,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const raw = await request.json().catch(() => null);
  const parsed = SaveBrowserPushInputSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { subscription, locale } = parsed.data;

  const saved = await prisma.browserPushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      locale: locale || null,
      userAgent: request.headers.get("user-agent"),
      isActive: true,
      lastSeenAt: new Date()
    },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      locale: locale || null,
      userAgent: request.headers.get("user-agent"),
      isActive: true,
      lastSeenAt: new Date()
    },
    select: {
      id: true,
      endpoint: true,
      isActive: true
    }
  });

  logger.info("Browser push subscription saved", {
    ...authorization.context,
    subscriptionId: saved.id
  });

  return NextResponse.json({
    ok: true,
    subscription: saved
  }, {
    headers: {
      "x-request-id": authorization.context.requestId
    }
  });
}
