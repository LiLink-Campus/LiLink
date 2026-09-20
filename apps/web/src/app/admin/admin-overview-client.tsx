"use client";

import Link from "next/link";
import { AdminIcon, type AdminIconName } from "./admin-icon";
import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import { formatChinaStandardDateTime } from "../../lib/china-standard-time";
import { cx } from "./admin-class-names";
import { useAdmin } from "./admin-context";
import styles from "./admin-overview.module.css";
import commonStyles from "./admin-common.module.css";
import type { AdminDashboardData } from "./types";

const adminStyles = [commonStyles];
const adminNumberFormatter = new Intl.NumberFormat("zh-CN");

function formatDateTime(value: string) {
  return formatChinaStandardDateTime(value);
}

export default function AdminOverviewPage({
  initialDashboard,
}: {
  initialDashboard: AdminDashboardData | null;
}) {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<AdminDashboardData | null>(initialDashboard);
  const [loading, setLoading] = useState(() => !initialDashboard);
  const [error, setError] = useState<string | null>(null);

  const [seedPending, setSeedPending] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextDashboard = await fetchApi<AdminDashboardData>("/admin/dashboard");
      setData(nextDashboard);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "后台数据加载失败。");
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
        `已创建 ${result.createdCount} 个测试用户，已加入轮次「${result.cycleName}」。本次密码（仅显示一次）：${result.password}`
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
      const result = await fetchApi<{ deletedCount: number }>("/admin/users/test-users", {
        method: "DELETE",
      });
      setDeleteMsg(`已删除 ${result.deletedCount} 个测试用户。`);
      void refresh();
    } catch (e) {
      setDeleteMsg(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletePending(false);
    }
  }

  const currentCycle =
    data?.recentCycles.find((cycle) => cycle.status === "OPEN") ??
    data?.recentCycles.find((cycle) => ["PREPARING", "REVEAL_READY"].includes(cycle.status));
  const labels = {
    DRAFT: "未开放",
    OPEN: "报名中",
    PREPARING: "匹配中",
    REVEAL_READY: "待揭晓",
    REVEALED: "已揭晓",
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>运营概览</h1>
          <p>掌握运营进展，处理重要事项。</p>
        </div>
        <button
          className="ui-button ui-button--secondary"
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <AdminIcon name="refresh" width="15" height="15" />
          {loading ? "刷新中…" : "刷新数据"}
        </button>
      </header>
      {error && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {error}
        </p>
      )}
      {!data ? (
        <div className={styles.empty}>
          {loading ? "正在加载运营数据…" : "数据暂时不可用，请重新刷新。"}
        </div>
      ) : (
        <>
          <section className={styles.metrics} aria-label="平台概况">
            {[
              {
                label: "正常账号",
                icon: "users" as AdminIconName,
                value: data.metrics.activeUsers,
                note: "账号状态正常，非日活",
                href: "/admin/users",
              },
              {
                label: "已提交问卷",
                icon: "questionnaire" as AdminIconName,
                value: data.metrics.completedQuestionnaires,
                note: "累计提交人数",
                href: "/admin/users",
              },
              {
                label: "学校",
                icon: "schools" as AdminIconName,
                value: data.metrics.schools,
                note: "已配置的学校",
                href: "/admin/schools",
              },
              {
                label: "待处理举报",
                icon: "reports" as AdminIconName,
                value: data.metrics.openReports,
                note: data.metrics.openReports ? "需要跟进" : "暂无积压",
                href: "/admin/reports",
              },
            ].map((metric) => (
              <Link key={metric.label} href={metric.href} className={styles.metric}>
                <AdminIcon name={metric.icon} className={styles.metricIcon} />
                <span>{metric.label}</span>
                <strong>{adminNumberFormatter.format(metric.value)}</strong>
                <small>{metric.note}</small>
              </Link>
            ))}
          </section>
          <div className={styles.columns}>
            <section className={styles.panel} aria-labelledby="overview-cycle-title">
              <div className={styles.panelHead}>
                <h2 id="overview-cycle-title">当前轮次</h2>
                <Link href="/admin/cycles">管理轮次 ↗</Link>
              </div>
              {currentCycle ? (
                <>
                  <div className={styles.cycleTitle}>
                    <h3>{currentCycle.codename}</h3>
                    <span className={styles.badge}>{labels[currentCycle.status]}</span>
                  </div>
                  <dl className={styles.cycleFacts}>
                    <div>
                      <dt>报名截止</dt>
                      <dd>{formatDateTime(currentCycle.participationDeadline)}</dd>
                    </div>
                    <div>
                      <dt>揭晓时间</dt>
                      <dd>{formatDateTime(currentCycle.revealAt)}</dd>
                    </div>
                    <div>
                      <dt>符合匹配条件</dt>
                      <dd>{currentCycle._count.participations} 人</dd>
                    </div>
                    <div>
                      <dt>已生成匹配</dt>
                      <dd>{currentCycle._count.matches} 组</dd>
                    </div>
                  </dl>
                  <ol className={styles.cycleProgress} aria-label="轮次进度">
                    {["报名", "匹配", "揭晓"].map((step, index) => (
                      <li
                        key={step}
                        data-active={
                          index <=
                          (currentCycle.status === "OPEN"
                            ? 0
                            : currentCycle.status === "PREPARING"
                              ? 1
                              : 2)
                        }
                      >
                        {step}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <div className={styles.empty}>
                  <AdminIcon name="cycles" className={styles.emptyIcon} />
                  <strong>暂无进行中的轮次</strong>
                  <p>前往轮次管理，安排下一次匹配。</p>
                  <Link href="/admin/cycles">查看轮次 →</Link>
                </div>
              )}
              {data.recentCycles.length > 0 && (
                <details className={styles.recent}>
                  <summary>最近轮次</summary>
                  <ul>
                    {data.recentCycles.slice(0, 4).map((cycle) => (
                      <li key={cycle.id}>
                        <span>{cycle.codename}</span>
                        <span>{labels[cycle.status]}</span>
                        <small>{formatDateTime(cycle.revealAt)}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            <section className={styles.panel} aria-labelledby="overview-todo-title">
              <div className={styles.panelHead}>
                <h2 id="overview-todo-title">待处理事项</h2>
                <Link href="/admin/reports">查看举报 ↗</Link>
              </div>
              {data.openReports.length ? (
                <ul className={styles.reports}>
                  {data.openReports.slice(0, 3).map((report) => (
                    <li key={report.id}>
                      <Link href="/admin/reports">
                        <strong>{report.reason}</strong>
                        <span>
                          {report.reporter.displayName ?? report.reporter.email} →{" "}
                          {report.reportedUser.displayName ?? report.reportedUser.email}
                        </span>
                        <small>{formatDateTime(report.createdAt)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.quiet}>
                  <span className={styles.checkIcon}>
                    <AdminIcon name="check" />
                  </span>
                  <div>
                    <strong>暂无待处理举报</strong>
                    <p>收到新的举报后，会在这里显示。</p>
                  </div>
                </div>
              )}
              <Link className={styles.taskLink} href="/admin/match-leads">
                <AdminIcon name="leads" />
                <span>
                  <strong>人工匹配登记</strong>
                  <small>查看报名信息，跟进咨询</small>
                </span>
                <AdminIcon name="arrow" width="16" height="16" />
              </Link>
            </section>
          </div>
          <section className={styles.panel}>
            <div className={styles.shortcutHead}>
              <h2>快捷入口</h2>
              <span>常用运营操作</span>
            </div>
            <nav className={styles.shortcuts} aria-label="常用操作">
              {[
                {
                  href: "/admin/users",
                  icon: "users" as const,
                  title: "用户管理",
                  note: "资料、状态与参与记录",
                },
                {
                  href: "/admin/cycles",
                  icon: "cycles" as const,
                  title: "轮次管理",
                  note: "报名进展、预演与最终匹配",
                },
                {
                  href: "/admin/campaigns",
                  icon: "campaigns" as const,
                  title: "商户活动",
                  note: "商家活动与优惠券",
                },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <AdminIcon name={item.icon} className={styles.shortcutIcon} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.note}</small>
                  </span>
                  <AdminIcon name="arrow" width="15" height="15" />
                </Link>
              ))}
            </nav>
          </section>
        </>
      )}
      <details className={styles.utilities}>
        <summary>
          <AdminIcon name="settings" width="16" height="16" />
          测试工具<span>模拟账号与匹配流程</span>
        </summary>
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
            用于验证注册后的问卷和匹配流程：生成 30
            个模拟账号，自动填好问卷并加入可用轮次。账号均标记为「测试用户」，可统一删除。密码仅在成功提示中显示一次，请自行妥善保存。
          </p>
          <div className="auth-actions" style={{ gap: "0.6rem", flexWrap: "wrap" }}>
            <button
              className="ui-button ui-button--primary"
              type="button"
              disabled={seedPending || deletePending}
              onClick={() => void runSeed()}
              style={{ minHeight: "2.1rem", padding: "0 1rem" }}
            >
              {seedPending ? "生成中…" : "生成测试用户"}
            </button>
            <button
              className="ui-button ui-button--secondary"
              type="button"
              disabled={deletePending || seedPending}
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
                color: seedMsg.startsWith("已创建") ? "var(--color-accent)" : "var(--color-danger)",
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
      </details>
    </div>
  );
}
