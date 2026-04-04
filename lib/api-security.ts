import { NextResponse } from "next/server";

import { getAdminSessionFromRequest, hasValidInternalToken } from "@/lib/auth/request";
import { logger } from "@/lib/logger";
import { getRequestContext } from "@/lib/request";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordSystemEvent } from "@/lib/system-events";

type AuthorizeOptions = {
  allowAdminSession?: boolean;
  allowInternalToken?: boolean;
  rateLimit?: {
    scope: string;
    limit: number;
    windowMs: number;
  };
};

type AuthorizedRequest =
  | {
      ok: true;
      context: ReturnType<typeof getRequestContext>;
      kind: "public" | "internal" | "admin";
      session?: Awaited<ReturnType<typeof getAdminSessionFromRequest>>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function authorizeRequest(request: Request, options: AuthorizeOptions): Promise<AuthorizedRequest> {
  const context = getRequestContext(request);

  if (options.rateLimit) {
    const rate = checkRateLimit(options.rateLimit.scope, context.ip, options.rateLimit.limit, options.rateLimit.windowMs);
    if (!rate.allowed) {
      logger.warn("Rate limit exceeded", {
        ...context,
        scope: options.rateLimit.scope,
        resetAt: new Date(rate.resetAt).toISOString()
      });
      void recordSystemEvent({
        level: "warn",
        category: "security.rate_limit",
        message: "Rate limit exceeded",
        source: "api-security",
        requestId: context.requestId,
        path: context.path,
        ipAddress: context.ip,
        meta: {
          scope: options.rateLimit.scope,
          resetAt: new Date(rate.resetAt).toISOString()
        }
      });
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "Too many requests"
          },
          {
            status: 429,
            headers: {
              "x-request-id": context.requestId,
              "x-ratelimit-reset": String(rate.resetAt)
            }
          }
        )
      };
    }
  }

  if (options.allowInternalToken && hasValidInternalToken(request)) {
    return {
      ok: true,
      context,
      kind: "internal" as const
    };
  }

  if (options.allowAdminSession) {
    const session = await getAdminSessionFromRequest(request);
    if (session) {
      return {
        ok: true,
        context,
        kind: "admin" as const,
        session
      };
    }
  }

  if (!options.allowAdminSession && !options.allowInternalToken) {
    return {
      ok: true,
      context,
      kind: "public"
    };
  }

  logger.warn("Unauthorized request rejected", context);
  void recordSystemEvent({
    level: "warn",
    category: "security.unauthorized",
    message: "Unauthorized request rejected",
    source: "api-security",
    requestId: context.requestId,
    path: context.path,
    ipAddress: context.ip,
    meta: {
      allowAdminSession: Boolean(options.allowAdminSession),
      allowInternalToken: Boolean(options.allowInternalToken)
    }
  });
  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        error: "Unauthorized"
      },
      {
        status: 401,
        headers: {
          "x-request-id": context.requestId
        }
      }
    )
  };
}
