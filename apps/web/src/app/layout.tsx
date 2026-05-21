import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { resolveApiOriginForPreconnect } from "../lib/public-server-api";
import { AuthSessionProvider } from "./auth-session";
import { AnnouncementDialog } from "./announcement-dialog";
import { PublicChrome } from "./public-chrome";
import { ServiceWorkerRegistrar } from "./_components/ServiceWorkerRegistrar";
import "./globals.css";

const apiPreconnectOrigin = resolveApiOriginForPreconnect();

export const metadata: Metadata = {
  title: "LiLink · 校园里的，认真相遇",
  description:
    "LiLink 是面向高校学生的匹配平台。基于深度问卷的匹配算法，每周一次轮次，认真对待每一份期待。",
  appleWebApp: {
    capable: true,
    title: "LiLink",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
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
        <ServiceWorkerRegistrar />
        <Analytics />
              {process.env.VERCEL_ENV === "production" && (
                  <SpeedInsights sampleRate={0.1} />
              )}
      </body>
    </html>
  );
}
