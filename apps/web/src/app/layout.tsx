import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from "@lilink/shared";
import { resolveApiOriginForPreconnect } from "../lib/api-preconnect";
import { getRequestLocale } from "../lib/locale";
import { AuthSessionProvider } from "./auth-session";
import { AnnouncementDialog } from "./announcement-dialog";
import { PublicChrome } from "./public-chrome";
import { LocaleProvider } from "./locale-context";
import "./globals.css";

const apiPreconnectOrigin = resolveApiOriginForPreconnect();
const localeBootstrapScript = `
(function () {
  try {
    var match = document.cookie.match(new RegExp("(?:^|; )${LOCALE_COOKIE_NAME}=([^;]*)"));
    var value = match ? decodeURIComponent(match[1]) : "";
    var locale = value === "en-US" ? "en-US" : "${DEFAULT_LOCALE}";
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  } catch (error) {
    document.documentElement.lang = "${DEFAULT_LOCALE}";
    document.documentElement.dataset.locale = "${DEFAULT_LOCALE}";
  }
})();
`;

export const metadata: Metadata = {
  title: "LiLink · 校园里的，认真相遇",
  description:
    "LiLink 是面向高校学生的匹配平台。基于深度问卷的匹配算法，每周一次轮次，认真对待每一份期待。",
};

export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = await getRequestLocale();

  return (
    <html
      lang={initialLocale}
      data-locale={initialLocale}
      data-scroll-behavior="smooth"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} />
        {apiPreconnectOrigin ? (
          <link
            rel="preconnect"
            href={apiPreconnectOrigin}
            crossOrigin="anonymous"
          />
        ) : null}
      </head>
      <body>
        <AuthSessionProvider>
          <LocaleProvider initialLocale={initialLocale}>
            <PublicChrome>{children}</PublicChrome>
            <AnnouncementDialog />
          </LocaleProvider>
        </AuthSessionProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
