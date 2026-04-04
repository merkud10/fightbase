import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";

function getPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
}

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, {
    rateLimit: {
      scope: "api:push:public-key",
      limit: 120,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const publicKey = getPublicKey();

  return NextResponse.json({
    ok: true,
    enabled: Boolean(publicKey),
    publicKey: publicKey || null
  }, {
    headers: {
      "x-request-id": authorization.context.requestId
    }
  });
}
