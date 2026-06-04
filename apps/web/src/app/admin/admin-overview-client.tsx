"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";
import { cx } from "./admin-class-names";
import { useAdmin } from "./admin-context";
import commonStyles from "./admin-common.module.css";
import type { AdminDashboardData } from "./types";

const adminStyles = [commonStyles];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

type SystemSettings = Record<string, string>;

const SHORTCUTS: { href: string; label: string }[] = [
  { href: "/admin/users", label: "用户中心" },
  { href: "/admin/schools", label: "学校中心" },
  { href: "/admin/questionnaire", label: "问卷构建器" },
  { href: "/admin/cycles", label: "轮次中心" },
  { href: "/admin/analytics", label: "数据分析" },
  { href: "/admin/campaigns", label: "活动券包" },
  { href: "/admin/merchants", label: "商家管理" },
  { href: "/admin/promotion", label: "推广数据" },
  { href: "/admin/reports", label: "举报中心" },
  { href: "/admin/audit", label: "审计日志" },
];

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

  async function runSeed() {
    setSeedPending(true);
    setSeedMsg(null);
    setDeleteMsg(null);
    try {
      const result = await fetchApi<{
        createdCount: number;
        cycleName: string;
        password: string;
      }>("/admin/seed-test-users", { method: "POST" });
      setSeedMsg(
        `已创建 ${result.createdCount} 个测试用户，已加入轮次「${result.cycleName}」。本次密码（仅显示一次）：${result.password}`,
      );
      void refresh();
    } catch (e) {
      setSeedMsg(e instanceof Error ? e.message : "生成失败");
    } finally {
      setSeedPending(false);
    }
  }

  async function runDelete() {
    if (!confirm("确定删除所有标记为「测试用户」的账号？\n此操作不可撤回。")) {
      return;
    }
    setDeletePending(true);
    setDeleteMsg(null);
    setSeedMsg(null);
    try {
      const result = await fetchApi<{ deletedCount: number }>(
        "/admin/users/test-users",
        { method: "DELETE" },
      );
      setDeleteMsg(`已删除 ${result.deletedCount} 个测试用户。`);
      void refresh();
    } catch (e) {
      setDeleteMsg(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletePending(false);
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
    return (
      <div className={cx(adminStyles, "admin-empty-state")}>正在加载后台概览...</div>
    );
  }

  if (!data || !summary) {
    return (
      <div className={cx(adminStyles, "ops-container")}>
        <div className={cx(adminStyles, "ops-header")}>
          <div>
            <h1>运营概览</h1>
            <p className={cx(adminStyles, "ops-header-desc")}>后台数据暂时不可用。</p>
          </div>
          <button
            className="ui-button ui-button--secondary"
            onClick={() => void refresh()}
            type="button"
          >
            重新加载
          </button>
        </div>
        {error && <p className="ui-form-message ui-form-message--error">{error}</p>}
      </div>
    );
  }

  const openCycle = summary.openCycle;
  const stats: {
    key: string;
    label: string;
    value: number;
    tone: string;
    note?: string;
  }[] = [
    { key: "active", label: "活跃用户", value: summary.activeUsers, tone: "sage" },
    {
      key: "quest",
      label: "已填问卷",
      value: summary.completedQuestionnaires,
      tone: "gold",
    },
    {
      key: "schools",
      label: "学校数量",
      value: data.metrics.schools,
      tone: "accent",
    },
    {
      key: "reports",
      label: "待处理举报",
      value: summary.openReports,
      tone: "coral",
      note: summary.openReports > 0 ? "需处理" : "无积压",
    },
    {
      key: "cycleParts",
      label: "本轮报名",
      value: openCycle?._count.participations ?? 0,
      tone: "brand",
      note: openCycle?.codename ?? "无进行中轮次",
    },
    {
      key: "cycleMatches",
      label: "已生成匹配",
      value: openCycle?._count.matches ?? 0,
      tone: "accent",
      note: openCycle ? "当前轮次" : "—",
    },
  ];

  return (
    <div className={cx(adminStyles, "ops-container")}>
      <div className={cx(adminStyles, "ops-header")}>
        <div>
          <h1>运营概览</h1>
          <p className={cx(adminStyles, "ops-header-desc")}>
            本周轮次、风险工单与关键配置一屏速览。
          </p>
        </div>
        <div className={cx(adminStyles, "ops-header-actions")}>
          <button
            className="ui-button ui-button--secondary"
            onClick={() => void refresh()}
            type="button"
            style={{ minHeight: "2.2rem", padding: "0 1rem" }}
          >
            刷新数据
          </button>
        </div>
      </div>

      {error && (
        <p
          className="ui-form-message ui-form-message--error"
          style={{ marginBottom: "0.9rem" }}
        >
          {error}
        </p>
      )}

      {/* KPI strip */}
      <section className={cx(adminStyles, "ops-stat-strip")}>
        {stats.map((s) => (
          <div
            key={s.key}
            className={cx(adminStyles, "ops-stat-tile", `is-${s.tone}`)}
          >
            <span className={cx(adminStyles, "ops-stat-label")}>{s.label}</span>
            <span className={cx(adminStyles, "ops-stat-value")}>
              {s.value.toLocaleString()}
            </span>
            {s.note ? (
              <span className={cx(adminStyles, "ops-stat-note")}>{s.note}</span>
            ) : null}
          </div>
        ))}
      </section>

      {/* Current cycle + open reports */}
      <section className={cx(adminStyles, "ops-split")}>
        <article className={cx(adminStyles, "ops-panel")}>
          <div className={cx(adminStyles, "ops-panel-head")}>
            <div>
              <p className={cx(adminStyles, "ops-eyebrow")}>轮次雷达</p>
              <h2>当前轮次</h2>
            </div>
            <Link className="ui-button ui-button--secondary" href="/admin/cycles">
              进入轮次中心
            </Link>
          </div>

          {openCycle ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.6rem",
                  flexWrap: "wrap",
                }}
              >
                <strong
                  style={{
                    fontSize: "1.15rem",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {openCycle.codename}
                </strong>
                <span className="ui-badge ui-badge--neutral">
                  {openCycle.status}
                </span>
              </div>
              <div className={cx(adminStyles, "adm-kv-grid")}>
                <div className={cx(adminStyles, "adm-kv")}>
                  <span>报名截止</span>
                  <strong>{formatDateTime(openCycle.participationDeadline)}</strong>
                </div>
                <div className={cx(adminStyles, "adm-kv")}>
                  <span>揭晓时间</span>
                  <strong>{formatDateTime(openCycle.revealAt)}</strong>
                </div>
                <div className={cx(adminStyles, "adm-kv")}>
                  <span>可匹配人数</span>
                  <strong>{openCycle._count.participations}</strong>
                </div>
                <div className={cx(adminStyles, "adm-kv")}>
                  <span>已生成匹配</span>
                  <strong>{openCycle._count.matches}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className={cx(adminStyles, "admin-empty-state")}>
              当前没有处于 OPEN 状态的轮次。
            </div>
          )}
        </article>

        <article className={cx(adminStyles, "ops-panel")}>
          <div className={cx(adminStyles, "ops-panel-head")}>
            <div>
              <p className={cx(adminStyles, "ops-eyebrow")}>风险队列</p>
              <h2>待处理举报</h2>
            </div>
            <Link className="ui-button ui-button--secondary" href="/admin/reports">
              举报中心
            </Link>
          </div>

          <div className={cx(adminStyles, "admin-mini-list")}>
            {data.openReports.slice(0, 5).map((report) => (
              <div
                key={report.id}
                className={cx(adminStyles, "admin-mini-list-item")}
              >
                <div className={cx(adminStyles, "admin-mini-list-main")}>
                  <strong className={cx(adminStyles, "admin-mini-list-title")}>
                    {report.reason}
                  </strong>
                  <p className={cx(adminStyles, "admin-mini-list-desc")}>
                    {report.reporter.displayName ?? report.reporter.email}
                    {" → "}
                    {report.reportedUser.displayName ?? report.reportedUser.email}
                  </p>
                </div>
                <span className="ui-badge ui-badge--neutral">
                  {formatDateTime(report.createdAt)}
                </span>
              </div>
            ))}
            {summary.openReports === 0 && (
              <div className={cx(adminStyles, "admin-empty-state")}>
                当前没有待处理举报。
              </div>
            )}
          </div>
        </article>
      </section>

      {/* Shortcuts */}
      <section>
        <p className={cx(adminStyles, "ops-eyebrow")}>快捷入口</p>
        <div className={cx(adminStyles, "ops-shortcuts")}>
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={cx(adminStyles, "ops-chip")}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Secondary utility region: config + test tools */}
      <section className={cx(adminStyles, "ops-utility")}>
        <div className={cx(adminStyles, "ops-utility-head")}>
          <h2>系统配置 · 测试工具</h2>
        </div>
        <div className={cx(adminStyles, "ops-utility-grid")}>
          {settings && (
            <div className={cx(adminStyles, "ops-utility-card")}>
              <h3>容量限制</h3>
              <div className={cx(adminStyles, "admin-capacity-field")}>
                <label
                  className={cx(adminStyles, "admin-field-label")}
                  htmlFor="admin-max-registrations"
                >
                  最大注册人数
                </label>
                <input
                  id="admin-max-registrations"
                  type="number"
                  min="0"
                  step="1"
                  value={settingsForm.maxReg}
                  onChange={(e) =>
                    setSettingsForm((f) => ({ ...f, maxReg: e.target.value }))
                  }
                  placeholder="0 = 不限制"
                />
                <p className={cx(adminStyles, "admin-capacity-hint")}>
                  0 表示不限制；达到上限后，新用户完成注册时会收到「名额已满」提示，无法再创建账号。
                </p>
              </div>
              <div
                className="auth-actions"
                style={{
                  marginTop: "0.75rem",
                  alignItems: "center",
                  gap: "0.6rem",
                }}
              >
                <button
                  className="ui-button ui-button--primary"
                  type="button"
                  disabled={settingsPending}
                  onClick={() => void saveSettings()}
                  style={{ minHeight: "2.1rem", padding: "0 1rem" }}
                >
                  {settingsPending ? "保存中…" : "保存限制"}
                </button>
                {settingsMsg && (
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color:
                        settingsMsg === "已保存"
                          ? "var(--color-accent)"
                          : "var(--color-danger)",
                    }}
                  >
                    {settingsMsg}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className={cx(adminStyles, "ops-utility-card")}>
            <h3>测试数据管理</h3>
            <p
              style={{
                fontSize: "0.84rem",
                color: "var(--color-text-secondary)",
                margin: "0 0 0.75rem",
                lineHeight: 1.5,
              }}
            >
              一键生成 30 个测试用户（含问卷与轮次参与）。密码仅在成功提示中显示一次，请自行妥善保存。
            </p>
            <div className="auth-actions" style={{ gap: "0.6rem", flexWrap: "wrap" }}>
              <button
                className="ui-button ui-button--primary"
                type="button"
                disabled={seedPending}
                onClick={() => void runSeed()}
                style={{ minHeight: "2.1rem", padding: "0 1rem" }}
              >
                {seedPending ? "生成中…" : "生成测试用户"}
              </button>
              <button
                className="ui-button ui-button--secondary"
                type="button"
                disabled={deletePending}
                onClick={() => void runDelete()}
                style={{
                  minHeight: "2.1rem",
                  padding: "0 1rem",
                  color: "var(--color-danger, #c0392b)",
                }}
              >
                {deletePending ? "删除中…" : "删除全部测试用户"}
              </button>
            </div>
            {seedMsg && (
              <p
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.85rem",
                  color: seedMsg.startsWith("已创建")
                    ? "var(--color-accent)"
                    : "var(--color-danger)",
                }}
              >
                {seedMsg}
              </p>
            )}
            {deleteMsg && (
              <p
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.85rem",
                  color: deleteMsg.startsWith("已删除")
                    ? "var(--color-accent)"
                    : "var(--color-danger)",
                }}
              >
                {deleteMsg}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
