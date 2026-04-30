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
import { LanguageSwitcher } from "../../language-switcher";
import { useLocale } from "../../locale-context";
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

const NAV_ITEMS: Record<"zh-CN" | "en-US", ReadonlyArray<NavItem>> = {
  "zh-CN": [
    { href: "/dashboard", label: "首页", Icon: HomeIcon },
    { href: "/dashboard/match", label: "我的匹配", Icon: HeartIcon },
    { href: "/dashboard/profile", label: "资料", Icon: ProfileIcon },
    { href: "/dashboard/me", label: "我的", Icon: UserCircleIcon },
  ],
  "en-US": [
    { href: "/dashboard", label: "Home", Icon: HomeIcon },
    { href: "/dashboard/match", label: "Match", Icon: HeartIcon },
    { href: "/dashboard/profile", label: "Profile", Icon: ProfileIcon },
    { href: "/dashboard/me", label: "Me", Icon: UserCircleIcon },
  ],
};

const APP_SHELL_COPY = {
  "zh-CN": {
    sidebar: "侧边导航",
    tagline: "校园里的，认真相遇",
    accountMenu: "账号菜单",
    unnamed: "未命名同学",
    notLoggedIn: "未登录",
    home: "返回首页",
    profile: "问卷资料",
    settings: "历史与设置",
    about: "关于平台",
    faq: "常见问题",
    logout: "退出登录",
    bottomNav: "底部导航",
  },
  "en-US": {
    sidebar: "Sidebar navigation",
    tagline: "Intentional campus matching",
    accountMenu: "Account menu",
    unnamed: "Unnamed student",
    notLoggedIn: "Not signed in",
    home: "Back to home",
    profile: "Questionnaire",
    settings: "History and settings",
    about: "About LiLink",
    faq: "FAQ",
    logout: "Log out",
    bottomNav: "Bottom navigation",
  },
} as const;

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
  const { locale } = useLocale();
  const copy = APP_SHELL_COPY[locale];
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
      <aside className="app-sidebar" aria-label={copy.sidebar}>
        <div className="app-sidebar-brand">
          <BrandMark
            href="/dashboard"
            tagline={copy.tagline}
            ariaLabel={locale === "zh-CN" ? "LiLink 首页" : "LiLink home"}
          />
        </div>
        <nav>
          <ul className="app-sidebar-nav">
            {NAV_ITEMS[locale].map(({ href, label, Icon }) => {
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
          {copy.tagline}
        </div>
      </aside>

      <div className="app-content">
        <header className="app-header">
          <BrandMark
            href="/dashboard"
            variant="compact"
            showTagline={false}
            ariaLabel={locale === "zh-CN" ? "LiLink 首页" : "LiLink home"}
          />
          <div className="app-header-actions">
            <LanguageSwitcher />
            <button
              ref={triggerRef}
              type="button"
              className="app-header-avatar"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${copy.accountMenu}: ${user?.displayName ?? user?.email ?? ""}`}
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
                  <strong>{user?.displayName ?? copy.unnamed}</strong>
                  <span>{user?.email ?? copy.notLoggedIn}</span>
                </div>
                <Link href="/dashboard" role="menuitem" onClick={closeMenu}>
                  {copy.home}
                </Link>
                <Link
                  href="/dashboard/profile"
                  role="menuitem"
                  onClick={closeMenu}
                >
                  {copy.profile}
                </Link>
                <Link
                  href="/dashboard/me"
                  role="menuitem"
                  onClick={closeMenu}
                >
                  {copy.settings}
                </Link>
                <Link href="/about" role="menuitem" onClick={closeMenu}>
                  {copy.about}
                </Link>
                <Link href="/faq" role="menuitem" onClick={closeMenu}>
                  {copy.faq}
                </Link>
                <button
                  type="button"
                  className="danger"
                  role="menuitem"
                  onClick={() => void handleLogout()}
                >
                  <LogoutIcon />
                  {copy.logout}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="app-main">{children}</main>

        <nav className="app-tabbar" aria-label={copy.bottomNav}>
          {NAV_ITEMS[locale].map(({ href, label, Icon }) => {
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
