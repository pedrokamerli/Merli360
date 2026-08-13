import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/api/login", "/manifest.webmanifest", "/icon.svg", "/sw.js", "/q", "/api/public-questionnaires"];
const authCookieName = "merli360_session";
const mustChangePasswordCookie = "merli360_must_change_password";
const firstSetupCookie = "merli360_first_setup";

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  if (host.startsWith("quest.") && pathname === "/") {
    return NextResponse.rewrite(new URL("/q/hms-saude-estetica", request.url));
  }
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(authCookieName)?.value;
  const mustChangePassword = request.cookies.get(mustChangePasswordCookie)?.value === "1";
  const firstSetup = request.cookies.get(firstSetupCookie)?.value === "1";

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Autenticacao obrigatoria" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const allowedPasswordPaths = ["/primeiro-acesso", "/api/account/password", "/api/logout"];
  if ((mustChangePassword || firstSetup) && !allowedPasswordPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Primeiro acesso obrigatorio" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/primeiro-acesso", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
