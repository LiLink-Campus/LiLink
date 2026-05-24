"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import brandStyles from "../brand-mark.module.css";
import { cx } from "./admin-class-names";
import { AdminProvider, useAdmin, type AdminIdentity } from "./admin-context";
import shellStyles from "./admin-layout-shell.module.css";

type NavItem = { href: string; label: string };

type NavGroup = {
  label: string;
  items: NavItem[];
};

const OVERVIEW_ITEM: NavItem = { href: "/admin", label: "概览" };
const adminBrandStyles = [brandStyles, shellStyles];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "平台",
    items: [
      { href: "/admin/users", label: "用户" },
      { href: "/admin/schools", label: "学校" },
    ],
  },
  {
    label: "商家推广",
    items: [
      { href: "/admin/invite-codes", label: "邀请码" },
      { href: "/admin/campaigns", label: "活动券包" },
      { href: "/admin/merchants", label: "商家" },
      { href: "/admin/promotion", label: "推广数据" },
    ],
  },
  {
    label: "匹配运营",
    items: [
      { href: "/admin/cycles", label: "轮次" },
      { href: "/admin/questionnaire", label: "问卷" },
    ],
  },
  {
    label: "安全审计",
    items: [
      { href: "/admin/reports", label: "举报" },
      { href: "/admin/audit", label: "审计" },
    ],
  },
];

function isNavActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/admin" && pathname.startsWith(`${href}/`))
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, error, login } = useAdmin();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (loading) {
    return (
      <div className={cx(shellStyles, "admin-gate")}>
        <p>加载中...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={cx(shellStyles, "admin-gate")}>
        <div className={cx(shellStyles, "admin-gate-card")}>
          <h1>运营后台</h1>
          <p>使用管理员账号登录。</p>
          <form
            className="auth-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const loginSucceeded = await login(email, password);
              if (!loginSucceeded) {
                return;
              }

              const nextPath = new URLSearchParams(window.location.search).get(
                "next",
              );
              const safeNext = sanitizeSameOriginRelativePath(
                nextPath,
                window.location.origin,
              );
              const redirectPath =
                safeNext && safeNext.startsWith("/admin/")
                  ? safeNext
                  : "/admin";
              router.replace(redirectPath);
            }}
          >
            <label>
              <span>管理员邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入管理员邮箱"
                autoFocus
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入管理员密码"
              />
            </label>
            {error ? <p className="ui-form-message ui-form-message--error">{error}</p> : null}
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={!email || !password}
            >
              进入后台
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function getActiveNavLabel(pathname: string) {
  if (isNavActive(pathname, OVERVIEW_ITEM.href)) {
    return OVERVIEW_ITEM.label;
  }

  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isNavActive(pathname, item.href)) {
        return item.label;
      }
    }
  }

  return "后台";
}

function AdminSidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdmin();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeLabel = useMemo(() => getActiveNavLabel(pathname), [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <aside
      className={cx(
        shellStyles,
        "admin-sidebar",
        mobileNavOpen && "is-mobile-nav-open",
      )}
    >
      <div className={cx(shellStyles, "admin-sidebar-mobile-bar")}>
        <Link
          href="/admin"
          className={cx(shellStyles, "admin-sidebar-mobile-title")}
          aria-label="LiLink 后台首页"
          onClick={() => setMobileNavOpen(false)}
        >
          <span
            className={cx(
              adminBrandStyles,
              "glyph admin-brand-glyph admin-brand-glyph-compact",
            )}
            aria-hidden="true"
          >
            <span className={cx(brandStyles, "glyphText")}>Li</span>
            <span className={cx(brandStyles, "glyphSparkle")} />
          </span>
          <span className={cx(shellStyles, "admin-sidebar-mobile-copy")}>
            <strong>LiLink 后台</strong>
            <span>{activeLabel}</span>
          </span>
        </Link>
        <button
          type="button"
          className={cx(shellStyles, "admin-sidebar-mobile-toggle")}
          aria-expanded={mobileNavOpen}
          aria-controls="admin-sidebar-nav"
          aria-label={mobileNavOpen ? "收起菜单" : "展开菜单"}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span
            className={cx(
              shellStyles,
              "admin-sidebar-mobile-toggle-icon",
              mobileNavOpen && "is-open",
            )}
            aria-hidden="true"
          />
        </button>
      </div>

      <Link
        href="/admin"
        className={cx(shellStyles, "admin-sidebar-brand")}
        aria-label="LiLink 后台首页"
      >
        <span
          className={cx(adminBrandStyles, "glyph admin-brand-glyph")}
          aria-hidden="true"
        >
          <span className={cx(brandStyles, "glyphText")}>Li</span>
          <span className={cx(brandStyles, "glyphSparkle")} />
        </span>
        <span className={cx(shellStyles, "admin-brand-copy")}>
          <strong>LiLink 后台</strong>
          <small>{admin?.displayName ?? admin?.email ?? "管理员"}</small>
        </span>
      </Link>
      <nav
        id="admin-sidebar-nav"
        className={cx(shellStyles, "admin-sidebar-nav")}
        aria-label="后台导航"
      >
        <div
          className={cx(
            shellStyles,
            "admin-sidebar-section admin-sidebar-section-overview",
          )}
        >
          <Link
            href={OVERVIEW_ITEM.href}
            className={cx(
              shellStyles,
              isNavActive(pathname, OVERVIEW_ITEM.href) && "admin-nav-active",
            )}
            onClick={() => setMobileNavOpen(false)}
          >
            {OVERVIEW_ITEM.label}
          </Link>
        </div>

        {NAV_GROUPS.map((group) => (
          <div
            key={group.label}
            className={cx(shellStyles, "admin-sidebar-section")}
          >
            <p className={cx(shellStyles, "admin-sidebar-section-label")}>
              {group.label}
            </p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  shellStyles,
                  isNavActive(pathname, item.href) && "admin-nav-active",
                )}
                onClick={() => setMobileNavOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <button
        className={cx(shellStyles, "admin-sidebar-logout")}
        onClick={() => void logout()}
        type="button"
      >
        退出后台
      </button>
    </aside>
  );
}

export default function AdminLayoutShell({
  children,
  initialAdmin,
  authChecked,
}: {
  children: React.ReactNode;
  initialAdmin: AdminIdentity | null;
  authChecked: boolean;
}) {
  return (
    <AdminProvider
      initialAdmin={initialAdmin}
      skipInitialRefresh={authChecked}
    >
      <AdminGate>
        <div className={cx(shellStyles, "admin-layout")}>
          <AdminSidebar />
          <div className={cx(shellStyles, "admin-main")}>{children}</div>
        </div>
      </AdminGate>
    </AdminProvider>
  );
}
