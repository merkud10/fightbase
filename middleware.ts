
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/admin") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|eot|json|xml|txt|map)$/i.test(pathname)) {
    return NextResponse.next();
  }

  const prefixed = stripLocalePrefix(pathname);
  const secure = isSecureContext(request);

  if (prefixed.locale) {
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

  const cookieLocale = request.cookies.get(localeCookieName)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : detectLocaleFromAcceptLanguage(request);
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = localizePath(pathname, locale);

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"]
};
