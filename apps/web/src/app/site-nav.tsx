"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchApi, fetchAuthMeDeduped, type AuthMePayload } from "../lib/api";

const PUBLIC_NAV_ITEMS = [
  { href: "/about", label: "关于" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "协议" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthMePayload | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setAuthenticatedUser(null);
      return;
    }

    let active = true;

    void fetchAuthMeDeduped()
      .then((user) => {
        if (!active) {
          return;
        }

        setAuthenticatedUser(user);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setAuthenticatedUser(null);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  if (pathname.startsWith("/admin")) {
    return null;
  }

  async function handleLogout() {
    await fetchApi("/auth/logout", {
      method: "POST",
    });

    setAuthenticatedUser(null);
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
      <nav className="site-nav">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <div className="site-nav-auth-cluster">
          {authenticatedUser ? (
            <>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
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
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                登录
              </Link>
              <Link
                className="button-ghost"
                href="/register"
                onClick={() => setMenuOpen(false)}
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
