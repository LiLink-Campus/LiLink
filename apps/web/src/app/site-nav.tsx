"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthSession } from "./auth-session";
import { fetchApi } from "../lib/api";

const PUBLIC_NAV_ITEMS = [
  { href: "/about", label: "关于" },
  { href: "/faq", label: "FAQ" },
  { href: "/schools", label: "支持的学校" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
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
        aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav className="site-nav" aria-label="主导航">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        <div className="site-nav-auth-cluster">
          {authenticatedUser ? (
            <>
              <Link href="/dashboard" onClick={closeMenu}>
                我的匹配
              </Link>
              <button
                type="button"
                className="site-nav-action"
                onClick={() => void handleLogout()}
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={closeMenu}>
                登录
              </Link>
              <Link
                className="button-primary"
                href="/register"
                onClick={closeMenu}
              >
                立即加入
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
