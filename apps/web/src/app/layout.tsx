import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { INSTALL_CAPTURE_SCRIPT } from "../lib/pwa-install-state";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { resolveApiOriginForPreconnect } from "../lib/public-server-api";
import { AuthSessionProvider } from "./auth-session";
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
    apple: "/icons/apple-touch-icon.png?v=brand-20260921",
    icon: [
      { url: "/favicon.ico?v=brand-20260921", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icons/favicon-32.png?v=brand-20260921", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg?v=brand-20260921", sizes: "any", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico?v=brand-20260921",
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
        <Script id="pwa-install-capture" strategy="beforeInteractive">{INSTALL_CAPTURE_SCRIPT}</Script>
        <AuthSessionProvider>
          <PwaInstallProvider><PublicChrome>{children}</PublicChrome></PwaInstallProvider>
        </AuthSessionProvider>
        <ServiceWorkerRegistrar />
        <Analytics />
        {process.env.VERCEL_ENV === "production" && <SpeedInsights sampleRate={0.1} />}
      </body>
    </html>
  );
}
