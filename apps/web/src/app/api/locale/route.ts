import { NextResponse } from "next/server";
import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
} from "@lilink/shared";
import {
  fetchUserApiServer,
  hasUserSessionCookie,
} from "../../../lib/server-api";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

type LocaleRequestBody = {
  locale?: unknown;
};

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | LocaleRequestBody
    | null;
  const locale = body?.locale;

  if (!isSupportedLocale(locale)) {
    return NextResponse.json(
      { message: "Unsupported locale." },
      { status: 400 },
    );
  }

  if (await hasUserSessionCookie()) {
    try {
      await fetchUserApiServer("/me/locale", {
        method: "PUT",
        body: JSON.stringify({ locale }),
      });
    } catch {
      return NextResponse.json(
        { message: "Failed to persist locale." },
        { status: 502 },
      );
    }
  }

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
