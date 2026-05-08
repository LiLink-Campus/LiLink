import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { resolveApiOriginForPreconnect } from "../lib/public-server-api";
import { AuthSessionProvider } from "./auth-session";
import { AnnouncementDialog } from "./announcement-dialog";
import { PublicChrome } from "./public-chrome";
import "./globals.css";

const apiPreconnectOrigin = resolveApiOriginForPreconnect();

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
    >
      <head>
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
          <PublicChrome>{children}</PublicChrome>
        </AuthSessionProvider>
        <AnnouncementDialog />
        <Analytics />
              {process.env.VERCEL_ENV === "production" && (
                  <SpeedInsights sampleRate={0.1} />
              )}
      </body>
    </html>
  );
}
