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

const METRIC_TONES: Record<string, string> = {
  sage: "admin-tone-sage",
  gold: "admin-tone-gold",
  accent: "admin-tone-accent",
  coral: "admin-tone-coral",
};

export default function AdminOverviewPage() {
  const { data, loading, error, refresh } =
    useAdminResource<AdminDashboardData>("/admin/dashboard");

  const summary = useMemo(() => {
    if (!data) return null;
    return {
      openReports: data.metrics.openReports,
      activeUsers: data.metrics.activeUsers,
      completedQuestionnaires: data.metrics.completedQuestionnaires,
      openCycle: data.recentCycles.find((c) => c.status === "OPEN"),
    };
  }, [data]);

  if (loading) {
    return <div className="admin-empty-state">正在加载后台概览...</div>;
  }

  if (!data || !summary) {
    return (
      <div className="qb-container">
        <div className="qb-header">
          <div>
            <h1>运营概览</h1>
            <p className="qb-header-desc">后台数据暂时不可用。</p>
          </div>
          <button
            className="button-secondary"
            onClick={() => void refresh()}
            type="button"
          >
            重新加载
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
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
    <div className="qb-container" style={{ maxWidth: "72rem" }}>
      <div className="qb-header">
        <div>
          <h1>运营概览</h1>
          <p className="qb-header-desc">
            本周轮次、风险工单和关键配置集中在这里。
          </p>
        </div>
        <button
          className="button-secondary"
          onClick={() => void refresh()}
          type="button"
          style={{ minHeight: "2.4rem", padding: "0 1rem" }}
        >
          刷新数据
        </button>
      </div>

      {error && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {/* Metrics */}
      <section className="admin-metric-grid" style={{ marginBottom: "1.25rem" }}>
        {metrics.map((m) => (
          <article
            key={m.label}
            className={`admin-metric-card ${METRIC_TONES[m.tone]}`}
          >
            <span className="admin-metric-label">{m.label}</span>
            <strong className="admin-metric-value">{m.value}</strong>
          </article>
        ))}
      </section>

      {/* Cycle + Reports */}
      <section
        className="admin-dashboard-grid"
        style={{ marginBottom: "1.25rem" }}
      >
        {/* Current cycle */}
        <article className="content-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">轮次雷达</p>
              <h2>当前轮次</h2>
            </div>
            <Link className="button-secondary" href="/admin/cycles">
              进入轮次中心
            </Link>
          </div>

          {summary.openCycle ? (
            <div className="admin-highlight-card">
              <strong style={{ fontSize: "1.15rem" }}>
                {summary.openCycle.codename}
              </strong>
              <p style={{ color: "var(--fg-secondary)", margin: "0.35rem 0 0" }}>
                状态：{summary.openCycle.status}
              </p>
              <div className="adm-kv-grid">
                <div className="adm-kv">
                  <span>报名截止</span>
                  <strong>
                    {formatDateTime(summary.openCycle.participationDeadline)}
                  </strong>
                </div>
                <div className="adm-kv">
                  <span>揭晓时间</span>
                  <strong>
                    {formatDateTime(summary.openCycle.revealAt)}
                  </strong>
                </div>
                <div className="adm-kv">
                  <span>参与记录</span>
                  <strong>
                    {summary.openCycle._count.participations}
                  </strong>
                </div>
                <div className="adm-kv">
                  <span>已生成匹配</span>
                  <strong>{summary.openCycle._count.matches}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-empty-state">
              当前没有处于 OPEN 状态的轮次。
            </div>
          )}
        </article>

        {/* Open reports */}
        <article className="content-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">风险队列</p>
              <h2>待处理举报</h2>
            </div>
            <Link className="button-secondary" href="/admin/reports">
              打开举报中心
            </Link>
          </div>

          <div className="admin-mini-list">
            {data.openReports.slice(0, 5).map((report) => (
              <div key={report.id} className="admin-mini-list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: "0.95rem" }}>
                    {report.reason}
                  </strong>
                  <p
                    style={{
                      margin: "0.15rem 0 0",
                      fontSize: "0.85rem",
                      color: "var(--fg-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {report.reporter.displayName ?? report.reporter.email}
                    {" → "}
                    {report.reportedUser.displayName ??
                      report.reportedUser.email}
                  </p>
                </div>
                <span className="domain-chip">
                  {formatDateTime(report.createdAt)}
                </span>
              </div>
            ))}
            {summary.openReports === 0 && (
              <div className="admin-empty-state">
                当前没有待处理举报。
              </div>
            )}
          </div>
        </article>
      </section>

      {/* Module shortcuts */}
      <section className="admin-module-grid">
        {[
          {
            href: "/admin/users",
            eyebrow: "用户",
            title: "用户中心",
            desc: "搜索用户、查看资料与问卷、调整账号状态。",
          },
          {
            href: "/admin/schools",
            eyebrow: "学校",
            title: "学校中心",
            desc: "维护学校档案、邮箱域名映射和用户覆盖情况。",
          },
          {
            href: "/admin/questionnaire",
            eyebrow: "问卷",
            title: "问卷构建器",
            desc: "管理题目顺序、题型、选项与匹配权重。",
          },
          {
            href: "/admin/audit",
            eyebrow: "审计",
            title: "审计日志",
            desc: "追踪轮次执行、配置修改和风险处理动作。",
          },
        ].map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="admin-module-card"
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "1.5rem",
            }}
          >
            <p className="eyebrow">{mod.eyebrow}</p>
            <h3 style={{ fontSize: "1.15rem", margin: "0.5rem 0" }}>
              {mod.title}
            </h3>
            <p style={{ marginTop: "auto", fontSize: "0.92rem" }}>
              {mod.desc}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
