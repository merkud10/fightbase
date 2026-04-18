
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { adminSessionCookieName, verifyAdminSessionToken } from "@/lib/auth/session";
import { localeCookieName } from "@/lib/locale-config";
import { isLocale, localizePath, stripLocalePrefix } from "@/lib/locale-path";

function detectLocaleFromAcceptLanguage(request: NextRequest): "ru" | "en" {
  const header = request.headers.get("accept-language") ?? "";
  const segments = header.split(",").map((segment) => {
    const [lang = "", q] = segment.trim().split(";q=");
    return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
  });

  segments.sort((a, b) => b.q - a.q);

  for (const segment of segments) {
    if (segment.lang.startsWith("ru")) return "ru";
    if (segment.lang.startsWith("en")) return "en";
  }

  return "ru";
}

function isSecureContext(request: NextRequest) {
  return request.nextUrl.protocol === "https:";
}

async function isAuthorizedAdminRequest(request: NextRequest) {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  const token = request.cookies.get(adminSessionCookieName)?.value;

  if (!secret || !token) {
    return false;
  }

  const session = await verifyAdminSessionToken(token, secret);
  return Boolean(session);
}

function buildAdminLoginRedirect(request: NextRequest, locale?: "ru" | "en") {
  const nextValue = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = locale ? localizePath("/admin/login", locale) : "/admin/login";
  redirectUrl.searchParams.set("next", nextValue);
  return redirectUrl;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const debugTag = process.env.FIGHTBASE_MIDDLEWARE_DEBUG === "1";

  // Next.js 15 повторно запускает middleware для rewrite-таргета.
  // В rewrite-ветке ниже мы проставляем x-fightbase-locale в request headers,
  // поэтому на re-invoke ловим этот маркер и не обрабатываем запрос второй раз —
  // иначе /ru/news -> rewrite /news -> redirect /ru/news зацикливается.
  if (request.headers.get("x-fightbase-locale")) {
    if (debugTag) {
      console.error(`[mw] SKIP re-invoke path=${pathname}`);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|json|xml|txt|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const prefixed = stripLocalePrefix(pathname);
  const secure = isSecureContext(request);

  if (debugTag) {
    console.error(
      `[mw] path=${pathname} host=${request.nextUrl.host} reqHost=${request.headers.get("host")} prefixed=${JSON.stringify(prefixed)}`
    );
  }

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }

    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.redirect(buildAdminLoginRedirect(request));
    }

    return NextResponse.next();
  }

  if (prefixed.locale && prefixed.pathname.startsWith("/admin")) {
    if (prefixed.pathname === "/admin/login") {
      const headers = new Headers(request.headers);
      headers.set("x-fightbase-locale", prefixed.locale);

      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = prefixed.pathname;

      const response = NextResponse.rewrite(rewriteUrl, {
        request: {
          headers
        }
      });

      response.cookies.set(localeCookieName, prefixed.locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        secure
      });

      return response;
    }

    if (!(await isAuthorizedAdminRequest(request))) {
      return NextResponse.redirect(buildAdminLoginRedirect(request, prefixed.locale));
    }

    const headers = new Headers(request.headers);
    headers.set("x-fightbase-locale", prefixed.locale);

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = prefixed.pathname;

    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers
      }
    });

    response.cookies.set(localeCookieName, prefixed.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure
    });

    return response;
  }

  if (prefixed.locale) {
    const headers = new Headers(request.headers);
    headers.set("x-fightbase-locale", prefixed.locale);

    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = prefixed.pathname;

    if (debugTag) {
      console.error(`[mw] BRANCH=rewrite-locale rewriteUrl=${rewriteUrl.toString()}`);
    }

    const response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers
      }
    });

    response.cookies.set(localeCookieName, prefixed.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure
    });

    return response;
  }

  const cookieLocale = request.cookies.get(localeCookieName)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : detectLocaleFromAcceptLanguage(request);
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = localizePath(pathname, locale);

  if (debugTag) {
    console.error(`[mw] BRANCH=redirect-to-locale redirectUrl=${redirectUrl.toString()}`);
  }

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"]
};
