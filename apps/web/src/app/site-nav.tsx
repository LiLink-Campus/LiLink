"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthSession } from "./auth-session";
import { fetchApi } from "../lib/api";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-context";

const PUBLIC_NAV_ITEMS = {
  "zh-CN": [
    { href: "/about", label: "关于" },
    { href: "/faq", label: "FAQ" },
    { href: "/schools", label: "支持的学校" },
  ],
  "en-US": [
    { href: "/about", label: "About" },
    { href: "/faq", label: "FAQ" },
    { href: "/schools", label: "Schools" },
  ],
} as const;

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLocale();
  const { user, setUser } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const onAdminPath = pathname.startsWith("/admin");
  const onDashboardPath = pathname.startsWith("/dashboard");
  const authenticatedUser = onAdminPath ? null : user;

  if (onAdminPath || onDashboardPath) {
    return null;
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleLogout() {
    await fetchApi("/auth/logout", { method: "POST" });
    setUser(null);
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div className={menuOpen ? "site-nav-shell open" : "site-nav-shell"}>
      <button
        type="button"
        className="site-nav-toggle"
        aria-expanded={menuOpen}
        aria-label={
          locale === "zh-CN"
            ? menuOpen
              ? "关闭导航菜单"
              : "打开导航菜单"
            : menuOpen
              ? "Close navigation menu"
              : "Open navigation menu"
        }
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav
        className="site-nav"
        aria-label={locale === "zh-CN" ? "主导航" : "Primary navigation"}
      >
        {PUBLIC_NAV_ITEMS[locale].map((item) => (
          <Link key={item.href} href={item.href} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        <div className="site-nav-auth-cluster">
          {authenticatedUser ? (
            <>
              <Link href="/dashboard" onClick={closeMenu}>
                {locale === "zh-CN" ? "我的匹配" : "Dashboard"}
              </Link>
              <button
                type="button"
                className="site-nav-action"
                onClick={() => void handleLogout()}
              >
                {locale === "zh-CN" ? "退出" : "Log out"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={closeMenu}>
                {locale === "zh-CN" ? "登录" : "Log in"}
              </Link>
              <Link
                className="button-primary"
                href="/register"
                onClick={closeMenu}
              >
                {locale === "zh-CN" ? "立即加入" : "Join now"}
              </Link>
            </>
          )}
          <span className="site-nav-divider" aria-hidden="true" />
          <LanguageSwitcher />
        </div>
      </nav>
    </div>
  );
}
