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
    return <div className="admin-empty-state">正在加载后台概览...</div>;
  }

  if (!data || !summary) {
    return (
      <div className="admin-page">
        <div className="admin-page-header">
          <div>
            <h1>运营概览</h1>
            <p>后台数据暂时不可用。</p>
          </div>
          <button className="button-secondary" onClick={() => void refresh()} type="button">
            重新加载
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
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
    <div className="admin-page admin-page-stack">
      <div className="admin-page-header">
        <div>
          <h1>运营概览</h1>
          <p>把本周轮次、风险工单和关键配置放在同一个控制面板里。</p>
        </div>
        <button className="button-secondary" onClick={() => void refresh()} type="button">
          刷新数据
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="admin-metric-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`admin-metric-card admin-tone-${metric.tone}`}>
            <span className="admin-metric-label">{metric.label}</span>
            <strong className="admin-metric-value">{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-grid">
        <article className="content-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">Cycle Radar</p>
              <h2>当前轮次</h2>
            </div>
            <Link className="button-secondary" href="/admin/cycles">
              进入轮次中心
            </Link>
          </div>

          {summary.openCycle ? (
            <div className="admin-highlight-card">
              <div>
                <strong>{summary.openCycle.codename}</strong>
                <p>状态：{summary.openCycle.status}</p>
              </div>
              <div className="admin-highlight-meta">
                <span>报名截止：{formatDateTime(summary.openCycle.participationDeadline)}</span>
                <span>揭晓时间：{formatDateTime(summary.openCycle.revealAt)}</span>
                <span>参与记录：{summary.openCycle._count.participations}</span>
                <span>已生成匹配：{summary.openCycle._count.matches}</span>
              </div>
            </div>
          ) : (
            <div className="admin-empty-state">当前没有处于 OPEN 状态的轮次。</div>
          )}
        </article>

        <article className="content-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">Risk Queue</p>
              <h2>待处理举报</h2>
            </div>
            <Link className="button-secondary" href="/admin/reports">
              打开举报中心
            </Link>
          </div>

          <div className="admin-mini-list">
            {data.openReports.slice(0, 5).map((report) => (
              <div key={report.id} className="admin-mini-list-item">
                <div>
                  <strong>{report.reason}</strong>
                  <p>
                    {report.reporter.displayName ?? report.reporter.email}
                    {" → "}
                    {report.reportedUser.displayName ?? report.reportedUser.email}
                  </p>
                </div>
                <span className="domain-chip">{formatDateTime(report.createdAt)}</span>
              </div>
            ))}
            {summary.openReports === 0 ? (
              <div className="admin-empty-state">当前没有待处理举报。</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="admin-module-grid">
        <Link href="/admin/users" className="admin-module-card">
          <p className="eyebrow">Users</p>
          <h3>用户中心</h3>
          <p>搜索用户、查看资料与问卷、调整账号状态。</p>
        </Link>
        <Link href="/admin/schools" className="admin-module-card">
          <p className="eyebrow">Schools</p>
          <h3>学校中心</h3>
          <p>维护学校档案、邮箱域名映射和用户覆盖情况。</p>
        </Link>
        <Link href="/admin/questionnaire" className="admin-module-card">
          <p className="eyebrow">Questionnaire</p>
          <h3>问卷构建器</h3>
          <p>管理题目顺序、题型、选项与匹配权重。</p>
        </Link>
        <Link href="/admin/audit" className="admin-module-card">
          <p className="eyebrow">Audit</p>
          <h3>审计日志</h3>
          <p>追踪轮次执行、配置修改和风险处理动作。</p>
        </Link>
      </section>
    </div>
  );
}
