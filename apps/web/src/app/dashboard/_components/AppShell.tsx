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
  HeartIcon,
  HomeIcon,
  LogoutIcon,
  ProfileIcon,
  UserCircleIcon,
} from "./icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/dashboard", label: "首页", Icon: HomeIcon },
  { href: "/dashboard/match", label: "我的匹配", Icon: HeartIcon },
  { href: "/dashboard/profile", label: "资料", Icon: ProfileIcon },
  { href: "/dashboard/me", label: "我的", Icon: UserCircleIcon },
];

function avatarInitial(user: AuthMePayload | null | undefined) {
  const source = (user?.displayName ?? user?.email ?? "NL").trim();
  if (!source) return "NL";
  const first = Array.from(source)[0];
  return first ? first.toUpperCase() : "NL";
}

function isActiveTab(currentPath: string, href: string) {
  if (href === "/dashboard") {
    return currentPath === "/dashboard";
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
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

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="侧边导航">
        <div className="app-sidebar-brand">
          <BrandMark href="/dashboard" />
        </div>
        <nav>
          <ul className="app-sidebar-nav">
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const active = isActiveTab(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={active ? "is-active" : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="app-sidebar-foot">
          LiLink · Weekly Reveal
          <br />
          校园里的，认真相遇
        </div>
      </aside>

      <div className="app-content">
        <header className="app-header">
          <BrandMark href="/dashboard" variant="compact" showTagline={false} />
          <div className="app-header-actions">
            <button
              ref={triggerRef}
              type="button"
              className="app-header-avatar"
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
                className="app-header-avatar-menu"
                role="menu"
              >
                <div className="app-header-avatar-menu-info">
                  <strong>{user?.displayName ?? "未命名同学"}</strong>
                  <span>{user?.email ?? "未登录"}</span>
                </div>
                <Link href="/dashboard" role="menuitem" onClick={closeMenu}>
                  返回首页
                </Link>
                <Link
                  href="/dashboard/profile"
                  role="menuitem"
                  onClick={closeMenu}
                >
                  问卷资料
                </Link>
                <Link
                  href="/dashboard/me"
                  role="menuitem"
                  onClick={closeMenu}
                >
                  历史与设置
                </Link>
                <Link href="/about" role="menuitem" onClick={closeMenu}>
                  关于平台
                </Link>
                <Link href="/faq" role="menuitem" onClick={closeMenu}>
                  常见问题
                </Link>
                <button
                  type="button"
                  className="danger"
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

        <main className="app-main">{children}</main>

        <nav className="app-tabbar" aria-label="底部导航">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActiveTab(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={active ? "app-tab is-active" : "app-tab"}
                aria-current={active ? "page" : undefined}
              >
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
