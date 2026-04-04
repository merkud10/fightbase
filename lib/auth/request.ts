import { adminSessionCookieName, verifyAdminSessionToken } from "@/lib/auth/session";

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>();

  for (const chunk of String(cookieHeader || "").split(";")) {
    const [key = "", ...rest] = chunk.trim().split("=");
    if (!key) {
      continue;
    }

    cookies.set(key, rest.join("="));
  }

  return cookies;
}

export async function getAdminSessionFromRequest(request: Request) {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (!secret) {
    return null;
  }

  const token = parseCookieHeader(request.headers.get("cookie")).get(adminSessionCookieName);
  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token, secret);
}

export function hasValidInternalToken(request: Request) {
  const expectedSecret = process.env.INTERNAL_API_SECRET?.trim() || process.env.INGEST_CRON_SECRET?.trim();

  if (!expectedSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const headerSecret = request.headers.get("x-internal-api-secret");
  const legacyHeaderSecret = request.headers.get("x-ingest-cron-secret");
  const providedSecret = headerSecret ?? legacyHeaderSecret ?? bearerSecret;

  return providedSecret === expectedSecret;
}
