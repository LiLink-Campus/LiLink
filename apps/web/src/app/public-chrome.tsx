"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { SiteNav } from "./site-nav";

/**
 * Renders the public marketing chrome (site-header + footer) only on
 * marketing/auth pages. Dashboard and admin sections own their own
 * shells and should not see this wrapper.
 */
export function PublicChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAppShell =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (isAppShell) {
    return <>{children}</>;
  }

  return (
    <div className="site-frame">
      <header className="site-header">
        <BrandMark href="/" />
        <SiteNav />
      </header>
      {children}
      <footer className="site-footer">
        <p>
          LiLink
          <small>校园里的，认真相遇</small>
        </p>
        <div>
          <Link href="/about">关于</Link>
          <Link href="/schools">支持的学校</Link>
          <Link href="/terms">协议</Link>
          <Link href="/privacy">隐私</Link>
          <Link href="/faq">FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
