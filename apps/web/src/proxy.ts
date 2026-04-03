import { NextRequest, NextResponse } from "next/server";

const USER_COOKIE_NAME = process.env.COOKIE_NAME ?? "lilink_token";
const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME ?? "lilink_admin_token";

function redirectTo(request: NextRequest, pathname: string) {
  const url = new URL(pathname, request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
  const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    if (!userToken) {
      return redirectTo(request, "/login");
    }
  }

  if (pathname.startsWith("/admin/")) {
    if (!adminToken) {
      return redirectTo(request, "/admin");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/admin/:path*"],
};
