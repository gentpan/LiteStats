import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_AUTH_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/passkey/login/options",
  "/api/auth/passkey/login/verify",
  "/api/auth/passkey/status",
]);

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/login") return true;
  if (pathname === "/tracker.js") return true;
  if (pathname === "/api/collect") return true;
  if (pathname === "/api/health") return true;
  if (PUBLIC_AUTH_ROUTES.has(pathname)) return true;
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("litestats_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
