"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthSession } from "./auth-session";
import { fetchApi } from "../lib/api";
import { LanguageSwitcher } from "./language-switcher";
import { useLocale } from "./locale-context";
import { LocalizedText } from "./localized-text";

const PUBLIC_NAV_ITEMS = [
  { href: "/about", zh: "关于", en: "About" },
  { href: "/faq", zh: "FAQ", en: "FAQ" },
  { href: "/schools", zh: "支持的学校", en: "Schools" },
] as const;

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
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} onClick={closeMenu}>
            <LocalizedText zh={item.zh} en={item.en} />
          </Link>
        ))}
        <div className="site-nav-auth-cluster">
          {authenticatedUser ? (
            <>
              <Link href="/dashboard" onClick={closeMenu}>
                <LocalizedText zh="我的匹配" en="Dashboard" />
              </Link>
              <button
                type="button"
                className="site-nav-action"
                onClick={() => void handleLogout()}
              >
                <LocalizedText zh="退出" en="Log out" />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={closeMenu}>
                <LocalizedText zh="登录" en="Log in" />
              </Link>
              <Link
                className="button-primary"
                href="/register"
                onClick={closeMenu}
              >
                <LocalizedText zh="立即加入" en="Join now" />
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
