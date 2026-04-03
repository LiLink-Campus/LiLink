import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "./site-nav";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

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
      <body>
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
              <Link href="/terms">协议</Link>
              <Link href="/privacy">隐私</Link>
              <Link href="/faq">FAQ</Link>
            </div>
          </footer>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
