"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminIcon, type AdminIconName } from "./admin-icon";
import { cx } from "./admin-class-names";
import { AdminProvider, useAdmin, type AdminIdentity } from "./admin-context";
import shellStyles from "./admin-layout-shell.module.css";

type NavItem = { href: string; label: string; icon: AdminIconName };

type NavGroup = {
  label: string;
  items: NavItem[];
};

const OVERVIEW_ITEM: NavItem = { href: "/admin", label: "运营概览", icon: "overview" };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "用户与学校",
    items: [
      { href: "/admin/users", label: "用户", icon: "users" },
      { href: "/admin/match-leads", label: "人工匹配登记", icon: "leads" },
      { href: "/admin/schools", label: "学校", icon: "schools" },
    ],
  },
  {
    label: "匹配运营",
    items: [
      { href: "/admin/cycles", label: "轮次", icon: "cycles" },
      { href: "/admin/questionnaire", label: "问卷", icon: "questionnaire" },
    ],
  },
  {
    label: "增长推广",
    items: [{ href: "/admin/promotion", label: "邀请推广", icon: "promotion" }],
  },
  {
    label: "商家合作",
    items: [
      { href: "/admin/campaigns", label: "商户活动", icon: "campaigns" },
      { href: "/admin/merchants", label: "合作商家", icon: "merchants" },
    ],
  },
  {
    label: "安全与审计",
    items: [
      { href: "/admin/reports", label: "举报", icon: "reports" },
      { href: "/admin/audit", label: "审计", icon: "audit" },
    ],
  },
];

function isNavActive(pathname: string, href: string) {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
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
          <Link href="/" className={shellStyles.loginWordmark}>
            LiLink
          </Link>
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

              const nextPath = new URLSearchParams(window.location.search).get("next");
              const safeNext = sanitizeSameOriginRelativePath(nextPath, window.location.origin);
              const redirectPath = safeNext && safeNext.startsWith("/admin/") ? safeNext : "/admin";
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
                autoComplete="username"
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
                autoComplete="current-password"
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
      onKeyDown={(event) => {
        if (event.key === "Escape") setMobileNavOpen(false);
      }}
      className={cx(shellStyles, "admin-sidebar", mobileNavOpen && "is-mobile-nav-open")}
    >
      <div className={cx(shellStyles, "admin-sidebar-mobile-bar")}>
        <Link
          href="/admin"
          className={cx(shellStyles, "admin-sidebar-mobile-title")}
          aria-label="LiLink 后台首页"
          onClick={() => setMobileNavOpen(false)}
        >
          <span className={shellStyles.mobileMonogram} aria-hidden="true">
            L
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
              mobileNavOpen && "is-open"
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
        <span className={shellStyles.wordmark}>
          LiLink<span>ADMIN</span>
        </span>
        <span className={shellStyles.brandSubtitle}>校园里的，认真相遇</span>
      </Link>
      <nav
        id="admin-sidebar-nav"
        className={cx(shellStyles, "admin-sidebar-nav")}
        aria-label="后台导航"
      >
        <div className={cx(shellStyles, "admin-sidebar-section admin-sidebar-section-overview")}>
          <Link
            href={OVERVIEW_ITEM.href}
            aria-current={isNavActive(pathname, OVERVIEW_ITEM.href) ? "page" : undefined}
            className={cx(
              shellStyles,
              isNavActive(pathname, OVERVIEW_ITEM.href) && "admin-nav-active"
            )}
            onClick={() => setMobileNavOpen(false)}
          >
            <AdminIcon name={OVERVIEW_ITEM.icon} />
            {OVERVIEW_ITEM.label}
          </Link>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={cx(shellStyles, "admin-sidebar-section")}>
            <p className={cx(shellStyles, "admin-sidebar-section-label")}>{group.label}</p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isNavActive(pathname, item.href) ? "page" : undefined}
                className={cx(shellStyles, isNavActive(pathname, item.href) && "admin-nav-active")}
                onClick={() => setMobileNavOpen(false)}
              >
                <AdminIcon name={item.icon} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className={shellStyles.account}>
        <span className={shellStyles.avatar} aria-hidden="true">
          {(admin?.displayName ?? "A").slice(0, 1)}
        </span>
        <span className={shellStyles.accountCopy}>
          <strong>{admin?.displayName ?? "管理员"}</strong>
          <small>管理员账号</small>
        </span>
        <button
          aria-label="退出后台"
          title="退出后台"
          className={cx(shellStyles, "admin-sidebar-logout")}
          onClick={() => void logout()}
          type="button"
        >
          <AdminIcon name="logout" />
        </button>
      </div>
    </aside>
  );
}

function AdminTopbar() {
  const pathname = usePathname();
  return (
    <header className={shellStyles.topbar}>
      <nav aria-label="面包屑" className={shellStyles.breadcrumb}>
        <Link href="/admin">管理后台</Link>
        <span aria-hidden="true">/</span>
        <span>{getActiveNavLabel(pathname)}</span>
      </nav>
      <Link href="/" className={shellStyles.returnLink}>
        返回网站 <AdminIcon name="external" width="14" height="14" />
      </Link>
    </header>
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
    <AdminProvider initialAdmin={initialAdmin} skipInitialRefresh={authChecked}>
      <AdminGate>
        <div className={cx(shellStyles, "admin-layout")}>
          <AdminSidebar />
          <div className={shellStyles.workspace}>
            <AdminTopbar />
            <main className={cx(shellStyles, "admin-main")}>{children}</main>
          </div>
        </div>
      </AdminGate>
    </AdminProvider>
  );
}
