"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchApi, type AuthMePayload } from "../../../lib/api";
import { useAuthSession } from "../../auth-session";
import { BrandMark } from "../../brand-mark";
import {
  ArrowLeftIcon,
  HeartIcon,
  HomeIcon,
  LogoutIcon,
  ProfileIcon,
  UserCircleIcon,
} from "./icons";
import styles from "./AppShell.module.css";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/dashboard", label: "首页", Icon: HomeIcon },
  { href: "/dashboard/match", label: "我的匹配", Icon: HeartIcon },
  { href: "/dashboard/profile", label: "我的资料", Icon: ProfileIcon },
  { href: "/dashboard/me", label: "用户中心", Icon: UserCircleIcon },
];

function avatarInitial(user: AuthMePayload | null | undefined) {
  const source = (user?.displayName ?? user?.email ?? "NL").trim();
  if (!source) return "NL";
  const first = Array.from(source)[0];
  return first ? first.toUpperCase() : "NL";
}

function isActiveTab(currentPath: string, href: string) {
  if (href === "/dashboard/me" && ["/dashboard/vip", "/dashboard/referrals", "/dashboard/coupons"].includes(currentPath)) return true;
  if (href === "/dashboard") {
    return currentPath === "/dashboard";
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

// Auxiliary pages use a back button instead of the main navigation.
function isFocusedPath(currentPath: string): boolean {
  return (
    currentPath === "/dashboard/referrals" ||
    currentPath === "/dashboard/coupons"
  );
}

function focusedTitleFor(currentPath: string): string {
  if (currentPath === "/dashboard/referrals") {
    return "我的邀请";
  }
  if (currentPath === "/dashboard/coupons") {
    return "我的优惠券";
  }
  return "用户中心";
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser } = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function closeMenu() {
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  async function handleLogout() {
    try {
      await fetchApi("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setMenuOpen(false);
      router.push("/");
      router.refresh();
    }
  }

  const focused = isFocusedPath(pathname);

  function handleFocusedBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (
      pathname === "/dashboard/referrals" ||
      pathname === "/dashboard/coupons"
    ) {
      router.push("/dashboard/me");
      return;
    }
    router.push("/dashboard/match");
  }

  return (
    <div className={focused ? `${styles.shell} ${styles.focused}` : styles.shell}>
      <div className={styles.content}>
        {focused ? (
          <header className={styles.focusedHeader}>
            <button
              type="button"
              className={styles.focusedBack}
              aria-label="返回"
              onClick={handleFocusedBack}
            >
              <ArrowLeftIcon />
            </button>
            <h1 className={styles.focusedTitle}>{focusedTitleFor(pathname)}</h1>
            <span className={styles.focusedHeaderSpacer} aria-hidden="true" />
          </header>
        ) : null}
          <header className={`${styles.header} ${focused ? styles.desktopOnly : ""}`}>
            <BrandMark href="/dashboard" variant="compact" showTagline={false} />
            <nav className={styles.headerNav} aria-label="主导航">
              {NAV_ITEMS.map(({ href, label }) => <Link key={href} href={href} onClick={closeMenu} aria-current={isActiveTab(pathname, href) ? "page" : undefined}>{label}</Link>)}
            </nav>
            <div className={styles.headerActions}>
              <button
                ref={triggerRef}
                type="button"
                className={styles.avatar}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`账号菜单：${user?.displayName ?? user?.email ?? ""}`}
                onClick={() => setMenuOpen((current) => !current)}
              >
                {avatarInitial(user)}
              </button>
              {menuOpen ? (
                <div
                  ref={menuRef}
                  className={styles.avatarMenu}
                  role="menu"
                >
                  <Link href="/" role="menuitem" onClick={closeMenu}>返回首页</Link>
                  <button
                    type="button"
                    className={styles.danger}
                    role="menuitem"
                    onClick={() => void handleLogout()}
                  >
                    <LogoutIcon />
                    退出登录
                  </button>
                </div>
              ) : null}
            </div>
          </header>

        <main className={styles.main}>{children}</main>

        {focused ? null : (
          <nav className={styles.tabbar} aria-label="底部导航">
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const active = isActiveTab(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={active ? `${styles.tab} ${styles.active}` : styles.tab}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        )}

      </div>
    </div>
  );
}
