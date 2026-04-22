import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { resolveApiOriginForPreconnect } from "../lib/public-server-api";
import { AuthSessionProvider } from "./auth-session";
import { SiteNav } from "./site-nav";
import { AnnouncementDialog } from "./announcement-dialog";
import "./globals.css";

const apiPreconnectOrigin = resolveApiOriginForPreconnect();

export const metadata: Metadata = {
  title: "LiLink | 黎安国际教育创新区交友平台",
  description:
    "LiLink 是面向黎安国际教育创新区的交友匹配平台，不做无限滑动，每周一个轮次，认真匹配。",
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
          <div className="site-frame">
            <header className="site-header">
              <Link className="brand-mark" href="/">
                <span className="brand-badge">Li</span>
                <span>
                  <strong>LiLink</strong>
                  <small>黎安国际教育创新区</small>
                </span>
              </Link>
              <SiteNav />
            </header>
            {children}
            <footer className="site-footer">
              <p>LiLink</p>
              <div>
                <Link href="/about">关于</Link>
                <Link href="/schools">支持的学校</Link>
                <Link href="/terms">协议</Link>
                <Link href="/privacy">隐私</Link>
                <Link href="/faq">FAQ</Link>
              </div>
            </footer>
          </div>
        </AuthSessionProvider>
        <AnnouncementDialog />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
