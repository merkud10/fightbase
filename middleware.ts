import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { localeCookieName } from "@/lib/locale-config";
import { isLocale, localizePath, stripLocalePrefix } from "@/lib/locale-path";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api") || pathname.startsWith("/admin") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next();
  }

  const prefixed = stripLocalePrefix(pathname);

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
      sameSite: "lax"
    });

    return response;
  }

  const cookieLocale = request.cookies.get(localeCookieName)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : "ru";
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = localizePath(pathname, locale);

  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"]
};
