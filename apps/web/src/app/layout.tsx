import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { resolveApiOriginForPreconnect } from "../lib/public-server-api";
import { AuthSessionProvider } from "./auth-session";
import { AnnouncementDialog } from "./announcement-dialog";
import { PublicChrome } from "./public-chrome";
import { PwaInstallProvider } from "./_components/PwaInstall";
import { ServiceWorkerRegistrar } from "./_components/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiLink · 校园里的，认真相遇",
  description:
    "LiLink 是面向高校学生的匹配平台。基于深度问卷的匹配算法，每周一次轮次，认真对待每一份期待。",
  appleWebApp: {
    capable: true,
    title: "LiLink",
    statusBarStyle: "default",
  },
  // Next emits the modern `mobile-web-app-capable`; keep the legacy Apple meta
  // explicitly so older iOS launches the home-screen app in standalone mode.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png?v=dove-20260920",
    icon: [{ url: "/icons/icon.svg?v=dove-20260920", sizes: "any", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiPreconnectOrigin = await resolveApiOriginForPreconnect();

  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <head>
        {apiPreconnectOrigin ? (
          <link rel="preconnect" href={apiPreconnectOrigin} crossOrigin="anonymous" />
        ) : null}
      </head>
      <body>
        <AuthSessionProvider>
          <PwaInstallProvider><PublicChrome>{children}</PublicChrome></PwaInstallProvider>
        </AuthSessionProvider>
        <AnnouncementDialog />
        <ServiceWorkerRegistrar />
        <Analytics />
        {process.env.VERCEL_ENV === "production" && <SpeedInsights sampleRate={0.1} />}
      </body>
    </html>
  );
}
