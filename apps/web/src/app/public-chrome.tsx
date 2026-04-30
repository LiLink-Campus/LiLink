"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { SiteNav } from "./site-nav";
import { LocalizedText } from "./localized-text";

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
        <BrandMark
          href="/"
          tagline={
            <LocalizedText
              zh="校园里的，认真相遇"
              en="Intentional campus matching"
            />
          }
          ariaLabel="LiLink home"
        />
        <SiteNav />
      </header>
      {children}
      <footer className="site-footer">
        <p>
          LiLink
          <small>
            <LocalizedText
              zh="校园里的，认真相遇"
              en="Intentional campus matching"
            />
          </small>
        </p>
        <div>
          <Link href="/about">
            <LocalizedText zh="关于" en="About" />
          </Link>
          <Link href="/schools">
            <LocalizedText zh="支持的学校" en="Schools" />
          </Link>
          <Link href="/terms">
            <LocalizedText zh="协议" en="Terms" />
          </Link>
          <Link href="/privacy">
            <LocalizedText zh="隐私" en="Privacy" />
          </Link>
          <Link href="/faq">FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
