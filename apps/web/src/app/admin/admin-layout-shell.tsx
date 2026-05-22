"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AdminProvider, useAdmin, type AdminIdentity } from "./admin-context";

const NAV_ITEMS = [
  { href: "/admin", label: "概览" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/schools", label: "学校" },
  { href: "/admin/invite-codes", label: "邀请码" },
  { href: "/admin/campaigns", label: "活动券包" },
  { href: "/admin/merchants", label: "商家" },
  { href: "/admin/promotion", label: "推广数据" },
  { href: "/admin/cycles", label: "轮次" },
  { href: "/admin/questionnaire", label: "问卷" },
  { href: "/admin/reports", label: "举报" },
  { href: "/admin/audit", label: "审计" },
];

function AdminGate({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, error, login } = useAdmin();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (loading) {
    return (
      <div className="admin-gate">
        <p>加载中...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="admin-gate">
        <div className="admin-gate-card">
          <h1>运营后台</h1>
          <p>使用管理员账号登录。</p>
          <form
            className="auth-form"
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
            {error ? <p className="form-error">{error}</p> : null}
            <button
              className="button-primary"
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

function AdminSidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAdmin();

  return (
    <aside className="admin-sidebar">
      <Link
        href="/admin"
        className="admin-sidebar-brand"
        aria-label="LiLink 后台首页"
      >
        <span className="brand-glyph admin-brand-glyph" aria-hidden="true">
          <span className="brand-glyph-text">Li</span>
          <span className="brand-glyph-sparkle" />
        </span>
        <span className="admin-brand-copy">
          <strong>LiLink 后台</strong>
          <small>{admin?.displayName ?? admin?.email ?? "管理员"}</small>
        </span>
      </Link>
      <nav className="admin-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`))
                ? "admin-nav-active"
                : ""
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <button
        className="admin-sidebar-logout"
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
        <div className="admin-layout">
          <AdminSidebar />
          <div className="admin-main">{children}</div>
        </div>
      </AdminGate>
    </AdminProvider>
  );
}
