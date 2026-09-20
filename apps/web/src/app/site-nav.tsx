"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui";
import { useAuthSession } from "./auth-session";
import styles from "./site-nav.module.css";

const PUBLIC_NAV_ITEMS = [
  { href: "/about", label: "关于我们" },
  { href: "/schools", label: "支持的学校" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { user } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const onAdminPath = pathname.startsWith("/admin");
  const onDashboardPath = pathname.startsWith("/dashboard");
  const authenticatedUser = onAdminPath ? null : user;

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  if (onAdminPath || onDashboardPath) {
    return null;
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className={menuOpen ? `${styles.shell} ${styles.open}` : styles.shell}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={menuOpen}
        aria-controls="public-site-nav"
        aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      <nav id="public-site-nav" className={styles.nav} aria-label="主导航">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={closeMenu}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        <div className={styles.authCluster}>
          <ButtonLink
            href={authenticatedUser ? "/dashboard" : "/login"}
            variant="secondary"
            onClick={closeMenu}
          >
            {authenticatedUser ? "我的匹配" : "登录"}
          </ButtonLink>
        </div>
      </nav>
    </div>
  );
}
