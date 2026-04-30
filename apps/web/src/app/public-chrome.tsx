"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { SiteNav } from "./site-nav";
import { useLocale } from "./locale-context";

const FOOTER_COPY = {
  "zh-CN": {
    tagline: "校园里的，认真相遇",
    about: "关于",
    schools: "支持的学校",
    terms: "协议",
    privacy: "隐私",
  },
  "en-US": {
    tagline: "Intentional campus matching",
    about: "About",
    schools: "Schools",
    terms: "Terms",
    privacy: "Privacy",
  },
} as const;

/**
 * Renders the public marketing chrome (site-header + footer) only on
 * marketing/auth pages. Dashboard and admin sections own their own
 * shells and should not see this wrapper.
 */
export function PublicChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const copy = FOOTER_COPY[locale];
  const isAppShell =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (isAppShell) {
    return <>{children}</>;
  }

  return (
    <div className="site-frame">
      <header className="site-header">
        <BrandMark
          href="/"
          tagline={copy.tagline}
          ariaLabel={locale === "zh-CN" ? "LiLink 首页" : "LiLink home"}
        />
        <SiteNav />
      </header>
      {children}
      <footer className="site-footer">
        <p>
          LiLink
          <small>{copy.tagline}</small>
        </p>
        <div>
          <Link href="/about">{copy.about}</Link>
          <Link href="/schools">{copy.schools}</Link>
          <Link href="/terms">{copy.terms}</Link>
          <Link href="/privacy">{copy.privacy}</Link>
          <Link href="/faq">FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
