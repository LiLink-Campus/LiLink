"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";
import { useAdmin } from "./admin-context";
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

type SystemSettings = Record<string, string>;

export default function AdminOverviewPage({
  initialDashboard,
  initialSettings,
}: {
  initialDashboard: AdminDashboardData | null;
  initialSettings: SystemSettings | null;
}) {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<AdminDashboardData | null>(initialDashboard);
  const [loading, setLoading] = useState(() => !initialDashboard);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(initialSettings);
  const [settingsForm, setSettingsForm] = useState({
    maxReg: initialSettings?.max_registrations ?? "0",
  });
  const [settingsPending, setSettingsPending] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const [seedPending, setSeedPending] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextDashboard, nextSettings] = await Promise.all([
        fetchApi<AdminDashboardData>("/admin/dashboard"),
        fetchApi<SystemSettings>("/admin/settings"),
      ]);
      setData(nextDashboard);
      setSettings(nextSettings);
      setSettingsForm({
        maxReg: nextSettings.max_registrations ?? "0",
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "后台数据加载失败。",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authenticated || initialDashboard) {
      return;
    }
    void refresh();
  }, [authenticated, initialDashboard, refresh]);

  async function saveSettings() {
    setSettingsPending(true);
    setSettingsMsg(null);
    try {
      const updated = await fetchApi<SystemSettings>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          max_registrations: settingsForm.maxReg,
        }),
      });
      setSettings(updated);
      setSettingsMsg("已保存");
      setTimeout(() => setSettingsMsg(null), 2000);
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSettingsPending(false);
    }
  }

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

      {/* Capacity settings */}
      {settings && (
        <section className="content-panel" style={{ marginBottom: "1.25rem", padding: "1.5rem" }}>
          <div className="admin-section-header" style={{ marginBottom: "1rem" }}>
            <div>
              <p className="eyebrow">灰度控制</p>
              <h2>容量限制</h2>
            </div>
          </div>
          <div className="admin-capacity-field">
            <label className="admin-field-label" htmlFor="admin-max-registrations">
              最大注册人数
            </label>
            <input
              id="admin-max-registrations"
              type="number"
              min="0"
              step="1"
              value={settingsForm.maxReg}
              onChange={(e) => setSettingsForm((f) => ({ ...f, maxReg: e.target.value }))}
              placeholder="0 = 不限制"
            />
            <p className="admin-capacity-hint">
              0 表示不限制。填写正整数时，以数据库中<strong>用户总数</strong>（含停用等所有账号）为准；达到上限后，新用户<strong>完成注册提交</strong>时会收到「名额已满」类提示，无法再创建账号。
            </p>
          </div>
          <div className="auth-actions" style={{ marginTop: "1rem" }}>
            <button className="button-primary" type="button" disabled={settingsPending} onClick={() => void saveSettings()} style={{ minHeight: "2.2rem", padding: "0 1rem" }}>
              {settingsPending ? "保存中…" : "保存限制"}
            </button>
            {settingsMsg && <span style={{ fontSize: "0.9rem", color: settingsMsg === "已保存" ? "var(--accent)" : "var(--error)" }}>{settingsMsg}</span>}
          </div>
        </section>
      )}

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
                  <span>可匹配人数</span>
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

      {/* Test tools */}
      <section className="content-panel" style={{ marginBottom: "1.25rem", padding: "1.5rem" }}>
        <div className="admin-section-header" style={{ marginBottom: "1rem" }}>
          <div>
            <p className="eyebrow">测试工具</p>
            <h2>测试数据管理</h2>
          </div>
        </div>
        <p style={{ fontSize: "0.9rem", color: "var(--fg-secondary)", marginBottom: "1rem" }}>
          一键生成 30 个测试用户（含问卷与轮次参与），用于验证匹配流程。所有测试用户密码统一为 <code>TestDemo_LiLink_42!</code>
        </p>
        <div className="auth-actions" style={{ gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="button-primary"
            type="button"
            disabled={seedPending}
            onClick={async () => {
              setSeedPending(true);
              setSeedMsg(null);
              setDeleteMsg(null);
              try {
                const result = await fetchApi<{ createdCount: number; cycleName: string }>("/admin/seed-test-users", { method: "POST" });
                setSeedMsg(`已创建 ${result.createdCount} 个测试用户，已加入轮次「${result.cycleName}」。`);
                void refresh();
              } catch (e) {
                setSeedMsg(e instanceof Error ? e.message : "生成失败");
              } finally {
                setSeedPending(false);
              }
            }}
            style={{ minHeight: "2.2rem", padding: "0 1rem" }}
          >
            {seedPending ? "生成中…" : "生成测试用户"}
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={deletePending}
            onClick={async () => {
              if (!confirm("确定删除所有标记为「测试用户」的账号？\n此操作不可撤回。")) return;
              setDeletePending(true);
              setDeleteMsg(null);
              setSeedMsg(null);
              try {
                const result = await fetchApi<{ deletedCount: number }>("/admin/users/test-users", { method: "DELETE" });
                setDeleteMsg(`已删除 ${result.deletedCount} 个测试用户。`);
                void refresh();
              } catch (e) {
                setDeleteMsg(e instanceof Error ? e.message : "删除失败");
              } finally {
                setDeletePending(false);
              }
            }}
            style={{ minHeight: "2.2rem", padding: "0 1rem", color: "var(--error, #c0392b)" }}
          >
            {deletePending ? "删除中…" : "删除全部测试用户"}
          </button>
        </div>
        {seedMsg && <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: seedMsg.startsWith("已创建") ? "var(--accent)" : "var(--error)" }}>{seedMsg}</p>}
        {deleteMsg && <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: deleteMsg.startsWith("已删除") ? "var(--accent)" : "var(--error)" }}>{deleteMsg}</p>}
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
