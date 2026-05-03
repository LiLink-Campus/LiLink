import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LOCALE_COOKIE_NAME,
  parseSupportedLocale,
  type SupportedLocale,
} from "@lilink/shared";
import { apiBaseUrl } from "../../../lib/api-base-url";

const USER_COOKIE_NAME = process.env.COOKIE_NAME?.trim() || "lilink_token";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const UNAUTHENTICATED_STATUSES = new Set([401, 403]);

type LocaleRequestBody = {
  locale?: unknown;
};

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | LocaleRequestBody
    | null;
  const locale = parseSupportedLocale(body?.locale);

  if (!locale) {
    return NextResponse.json(
      { message: "Unsupported locale." },
      { status: 400 },
    );
  }

  const userSessionCookie = (await cookies()).get(USER_COOKIE_NAME)?.value;

  if (userSessionCookie) {
    try {
      const persistResponse = await fetch(`${apiBaseUrl}/me/locale`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${USER_COOKIE_NAME}=${userSessionCookie}`,
        },
        body: JSON.stringify({ locale }),
        cache: "no-store",
      });

      if (!persistResponse.ok) {
        if (UNAUTHENTICATED_STATUSES.has(persistResponse.status)) {
          return localeCookieResponse(locale);
        }

        return NextResponse.json(
          { message: "Failed to persist locale." },
          { status: 502 },
        );
      }
    } catch {
      return NextResponse.json(
        { message: "Failed to persist locale." },
        { status: 502 },
      );
    }
  }

  return localeCookieResponse(locale);
}

function localeCookieResponse(locale: SupportedLocale) {
  const response = NextResponse.json({
    locale,
  });

  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
