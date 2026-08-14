import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/api-security";
import { logger } from "@/lib/logger";
import { filterRevalidatePaths } from "@/lib/revalidate-paths";

// Точечная ревалидация публичных страниц после фоновых обновлений данных
// (результаты боёв в ночь турнира и т.п.). Пути фильтруются по allowlist.
export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, {
    allowInternalToken: true,
    rateLimit: {
      scope: "api:cron:revalidate",
      limit: 30,
      windowMs: 60_000
    }
  });

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = await request.json().catch(() => ({}));
  const targets = filterRevalidatePaths((body as { paths?: unknown }).paths);

  for (const target of targets) {
    if (target.type === "page") {
      revalidatePath(target.path, "page");
    } else {
      revalidatePath(target.path);
    }
  }

  logger.info("Cron revalidate executed", {
    ...authorization.context,
    count: targets.length,
    paths: targets.map((target) => target.path)
  });

  return NextResponse.json(
    { ok: true, revalidated: targets.map((target) => target.path) },
    {
      headers: {
        "cache-control": "no-store",
        "x-request-id": authorization.context.requestId
      }
    }
  );
}
