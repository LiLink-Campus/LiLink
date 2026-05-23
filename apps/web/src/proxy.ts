import { NextRequest, NextResponse } from "next/server";

const USER_COOKIE_NAME = process.env.COOKIE_NAME ?? "lilink_token";
const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME ?? "lilink_admin_token";
const MERCHANT_COOKIE_NAME =
  process.env.MERCHANT_COOKIE_NAME ?? "lilink_merchant_token";

function redirectTo(request: NextRequest, pathname: string) {
  const url = new URL(pathname, request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userToken = request.cookies.get(USER_COOKIE_NAME)?.value;
  const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const merchantToken = request.cookies.get(MERCHANT_COOKIE_NAME)?.value;

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

  // /r/* is the merchant scan-confirm area: QR code scans land here.
  // Unauthenticated merchants are redirected to /merchant/login.
  // The TOTP lives in the hash fragment, which is dropped on redirect;
  // after login the page surfaces the "请重新出示" message — expected.
  if (pathname.startsWith("/r/")) {
    if (!merchantToken) {
      return redirectTo(request, "/merchant/login");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/admin/:path*", "/r/:path*"],
};
