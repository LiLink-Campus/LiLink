import { NextResponse } from "next/server";
import {
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  type SupportedLocale,
} from "@lilink/shared";
import {
  fetchUserApiServer,
  hasUserSessionCookie,
} from "../../../lib/server-api";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

type LocaleRequestBody = {
  locale?: unknown;
};

async function persistLocaleForAuthenticatedUser(locale: SupportedLocale) {
  if (!(await hasUserSessionCookie())) {
    return false;
  }

  try {
    await fetchUserApiServer("/me/locale", {
      method: "PUT",
      body: JSON.stringify({ locale }),
    });
    return true;
  } catch {
    return false;
  }
}

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

  const persisted = await persistLocaleForAuthenticatedUser(locale);

  const response = NextResponse.json({
    locale,
    persisted,
  });

  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
