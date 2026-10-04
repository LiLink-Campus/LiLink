"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
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
  const menu = useRef<HTMLDetailsElement>(null);
  const onAdminPath = pathname.startsWith("/admin");
  const onDashboardPath = pathname.startsWith("/dashboard");
  const authenticatedUser = onAdminPath ? null : user;

  if (onAdminPath || onDashboardPath) {
    return null;
  }

  function closeMenu() {
    if (menu.current) menu.current.open = false;
  }

  return (
    // Native toggles may change `open` before React hydrates this element.
    <details ref={menu} className={styles.shell} suppressHydrationWarning onKeyDown={event => {
      if (event.key === "Escape" && menu.current?.open) {
        closeMenu();
        menu.current.querySelector("summary")?.focus();
      }
    }}>
      <summary
        role="button"
        className={styles.toggle}
        aria-controls="public-site-nav"
        aria-label="导航菜单"
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </summary>
      <nav id="public-site-nav" className={styles.nav} aria-label="主导航">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link prefetch={false}
            key={item.href}
            href={item.href}
            onClick={closeMenu}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
        <div className={styles.authCluster}>
          <ButtonLink prefetch={false}
            href={authenticatedUser ? "/dashboard" : "/login"}
            variant="secondary"
            onClick={closeMenu}
          >
            {authenticatedUser ? "我的匹配" : "登录"}
          </ButtonLink>
        </div>
      </nav>
    </details>
  );
}
