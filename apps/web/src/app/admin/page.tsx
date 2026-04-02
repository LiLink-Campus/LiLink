"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAdminResource } from "./use-admin-resource";
import type { AdminDashboardData } from "./types";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminOverviewPage() {
  const { data, loading, error, refresh } =
    useAdminResource<AdminDashboardData>("/admin/dashboard");

  const summary = useMemo(() => {
    if (!data) {
      return null;
    }

    const openCycle = data.recentCycles.find((cycle) => cycle.status === "OPEN");

    return {
      openReports: data.metrics.openReports,
      activeUsers: data.metrics.activeUsers,
      completedQuestionnaires: data.metrics.completedQuestionnaires,
      openCycle,
    };
  }, [data]);

  if (loading) {
    return <div className="admin-empty-state" style={{ padding: "4rem 2rem", fontSize: "1.1rem" }}>正在加载后台概览...</div>;
  }

  if (!data || !summary) {
    return (
      <div className="admin-page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
          <div>
            <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>运营概览</h1>
            <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>后台数据暂时不可用。</p>
          </div>
          <button className="button-secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}>
            重新加载
          </button>
        </div>
        {error ? <p className="form-error" style={{ padding: "1rem", background: "var(--error-soft)", borderRadius: "var(--radius-md)" }}>{error}</p> : null}
      </div>
    );
  }

  const metrics = [
    { label: "活跃用户", value: summary.activeUsers, tone: "sage" },
    { label: "已填问卷", value: summary.completedQuestionnaires, tone: "gold" },
    { label: "学校数量", value: data.metrics.schools, tone: "accent" },
    { label: "待处理举报", value: summary.openReports, tone: "coral" },
  ];

  return (
    <div className="admin-page admin-page-stack" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>运营概览</h1>
          <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>把本周轮次、风险工单和关键配置放在同一个控制面板里。</p>
        </div>
        <button className="button-secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}>
          刷新数据
        </button>
      </div>

      {error ? <p className="form-error" style={{ padding: "1rem", background: "var(--error-soft)", borderRadius: "var(--radius-md)", marginBottom: "1.25rem" }}>{error}</p> : null}

      <section className="admin-metric-grid" style={{ gap: "1.25rem", marginBottom: "1.25rem" }}>
        {metrics.map((metric) => (
          <article key={metric.label} className={`admin-metric-card admin-tone-${metric.tone}`} style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "1.5rem" }}>
            <span className="admin-metric-label" style={{ marginBottom: "0.5rem" }}>{metric.label}</span>
            <strong className="admin-metric-value" style={{ margin: 0, lineHeight: 1 }}>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-grid" style={{ gap: "1.25rem", marginBottom: "1.25rem" }}>
        <article className="content-panel" style={{ display: "flex", flexDirection: "column", padding: "2rem" }}>
          <div className="admin-section-header" style={{ marginBottom: "1.5rem" }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>轮次雷达</p>
              <h2 style={{ fontSize: "1.5rem" }}>当前轮次</h2>
            </div>
            <Link className="button-secondary" href="/admin/cycles" style={{ minHeight: "2.5rem", padding: "0 1.2rem", fontSize: "0.9rem" }}>
              进入轮次中心
            </Link>
          </div>

          {summary.openCycle ? (
            <div className="admin-highlight-card" style={{ marginTop: "auto", padding: "1.5rem" }}>
              <div>
                <strong style={{ fontSize: "1.25rem" }}>{summary.openCycle.codename}</strong>
                <p style={{ marginTop: "0.5rem", color: "var(--fg-secondary)", fontSize: "0.95rem" }}>状态：{summary.openCycle.status}</p>
              </div>
              <div className="admin-highlight-meta" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>报名截止</span>
                  <strong style={{ color: "var(--fg)", fontSize: "0.95rem" }}>{formatDateTime(summary.openCycle.participationDeadline)}</strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>揭晓时间</span>
                  <strong style={{ color: "var(--fg)", fontSize: "0.95rem" }}>{formatDateTime(summary.openCycle.revealAt)}</strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>参与记录</span>
                  <strong style={{ color: "var(--fg)", fontSize: "0.95rem" }}>{summary.openCycle._count.participations}</strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>已生成匹配</span>
                  <strong style={{ color: "var(--fg)", fontSize: "0.95rem" }}>{summary.openCycle._count.matches}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-empty-state" style={{ marginTop: "auto" }}>当前没有处于 OPEN 状态的轮次。</div>
          )}
        </article>

        <article className="content-panel" style={{ display: "flex", flexDirection: "column", padding: "2rem" }}>
          <div className="admin-section-header" style={{ marginBottom: "1.5rem" }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>风险队列</p>
              <h2 style={{ fontSize: "1.5rem" }}>待处理举报</h2>
            </div>
            <Link className="button-secondary" href="/admin/reports" style={{ minHeight: "2.5rem", padding: "0 1.2rem", fontSize: "0.9rem" }}>
              打开举报中心
            </Link>
          </div>

          <div className="admin-mini-list" style={{ marginTop: "auto" }}>
            {data.openReports.slice(0, 5).map((report) => (
              <div key={report.id} className="admin-mini-list-item" style={{ alignItems: "center" }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: "1rem" }}>
                  <strong style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.95rem" }}>{report.reason}</strong>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--fg-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {report.reporter.displayName ?? report.reporter.email} {" → "} {report.reportedUser.displayName ?? report.reportedUser.email}
                  </p>
                </div>
                <span className="domain-chip" style={{ flexShrink: 0, fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>{formatDateTime(report.createdAt)}</span>
              </div>
            ))}
            {summary.openReports === 0 ? (
              <div className="admin-empty-state">当前没有待处理举报。</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="admin-module-grid" style={{ gap: "1.25rem" }}>
        <Link href="/admin/users" className="admin-module-card" style={{ display: "flex", flexDirection: "column", padding: "1.5rem" }}>
          <p className="eyebrow">用户</p>
          <h3 style={{ fontSize: "1.25rem", margin: "0.5rem 0" }}>用户中心</h3>
          <p style={{ marginTop: "auto", fontSize: "0.95rem" }}>搜索用户、查看资料与问卷、调整账号状态。</p>
        </Link>
        <Link href="/admin/schools" className="admin-module-card" style={{ display: "flex", flexDirection: "column", padding: "1.5rem" }}>
          <p className="eyebrow">学校</p>
          <h3 style={{ fontSize: "1.25rem", margin: "0.5rem 0" }}>学校中心</h3>
          <p style={{ marginTop: "auto", fontSize: "0.95rem" }}>维护学校档案、邮箱域名映射和用户覆盖情况。</p>
        </Link>
        <Link href="/admin/questionnaire" className="admin-module-card" style={{ display: "flex", flexDirection: "column", padding: "1.5rem" }}>
          <p className="eyebrow">问卷</p>
          <h3 style={{ fontSize: "1.25rem", margin: "0.5rem 0" }}>问卷构建器</h3>
          <p style={{ marginTop: "auto", fontSize: "0.95rem" }}>管理题目顺序、题型、选项与匹配权重。</p>
        </Link>
        <Link href="/admin/audit" className="admin-module-card" style={{ display: "flex", flexDirection: "column", padding: "1.5rem" }}>
          <p className="eyebrow">审计</p>
          <h3 style={{ fontSize: "1.25rem", margin: "0.5rem 0" }}>审计日志</h3>
          <p style={{ marginTop: "auto", fontSize: "0.95rem" }}>追踪轮次执行、配置修改和风险处理动作。</p>
        </Link>
      </section>
    </div>
  );
}
