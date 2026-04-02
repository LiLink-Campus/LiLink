"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AdminProvider, useAdmin } from "./admin-context";

const NAV_ITEMS = [
  { href: "/admin", label: "概览" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/schools", label: "学校" },
  { href: "/admin/cycles", label: "轮次" },
  { href: "/admin/questionnaire", label: "问卷" },
  { href: "/admin/reports", label: "举报" },
  { href: "/admin/audit", label: "审计" },
];

function AdminGate({ children }: { children: React.ReactNode }) {
  const { authenticated, loading, error, login } = useAdmin();
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
            onSubmit={(e) => {
              e.preventDefault();
              void login(email, password);
            }}
          >
            <label>
              <span>Admin Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@your-domain.com"
                autoFocus
              />
            </label>
            <label>
              <span>Password</span>
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
      <div className="admin-sidebar-brand">
        <span className="brand-badge" style={{ width: "2rem", height: "2rem", fontSize: "0.75rem" }}>Li</span>
        <div>
          <strong>LiLink Admin</strong>
          <p>{admin?.displayName ?? admin?.email ?? "Admin"}</p>
        </div>
      </div>
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

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProvider>
      <AdminGate>
        <div className="admin-layout">
          <AdminSidebar />
          <div className="admin-main">{children}</div>
        </div>
      </AdminGate>
    </AdminProvider>
  );
}
