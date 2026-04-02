"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { HARD_MATCH_KEYS } from "../../../lib/hard-match";
import { useAdminCollection } from "../use-admin-collection";
import type { AdminUser } from "../types";

const ANSWER_LABELS: Record<string, string> = {
  [HARD_MATCH_KEYS.birthDate]: "出生年月日",
  [HARD_MATCH_KEYS.partnerAgeMin]: "希望对方年龄下限",
  [HARD_MATCH_KEYS.partnerAgeMax]: "希望对方年龄上限",
  [HARD_MATCH_KEYS.gender]: "你的性别",
  [HARD_MATCH_KEYS.partnerGenders]: "希望对方的性别",
  [HARD_MATCH_KEYS.looks]: "颜值自评",
  [HARD_MATCH_KEYS.partnerLooks]: "希望对方的颜值",
  [HARD_MATCH_KEYS.race]: "你的人种",
  [HARD_MATCH_KEYS.partnerRaces]: "希望对方的人种",
};

const USER_STATUS_LABELS: Record<"ALL" | AdminUser["status"], string> = {
  ALL: "全部",
  ACTIVE: "正常",
  PENDING: "待激活",
  SUSPENDED: "已停用",
};

function formatAnswer(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("、");
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return JSON.stringify(value);
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminUser["status"]>(
    "ALL",
  );
  const [questionnaireFilter, setQuestionnaireFilter] = useState<
    "all" | "submitted" | "missing"
  >("all");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const { data, loading, error, refresh } = useAdminCollection<AdminUser>(
    "/admin/users",
    {
      page,
      pageSize: 12,
      search: deferredSearch.trim(),
      status: statusFilter === "ALL" ? undefined : statusFilter,
      questionnaire: questionnaireFilter,
    },
  );
  const users = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }

    if (!selectedUserId || !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  async function updateUserStatus(status: AdminUser["status"]) {
    if (!selectedUser) {
      return;
    }

    setPending(status);
    setActionError(null);

    try {
      await fetchApi(`/admin/users/${selectedUser.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "用户状态更新失败。",
      );
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载用户中心...</div>;
  }

  return (
    <div
      className="admin-page admin-page-stack"
      style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}
    >
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>用户中心</h1>
          <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>
            先定位用户，再查看资料、问卷与轮次参与状态，必要时直接处理账号状态。
          </p>
        </div>
        <button
          className="button-secondary"
          onClick={() => void refresh()}
          type="button"
          style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}
        >
          刷新
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}

      <section className="admin-workspace-grid">
        <article className="content-panel admin-list-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">用户列表</p>
              <h2>全部用户</h2>
            </div>
          </div>
          <div className="admin-search-bar">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索邮箱、昵称、姓名、学校或状态"
            />
          </div>
          <div className="admin-tabs">
            {(["ALL", "ACTIVE", "PENDING", "SUSPENDED"] as const).map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  className={
                    statusFilter === status
                      ? "admin-tab active"
                      : "admin-tab"
                  }
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                >
                  {USER_STATUS_LABELS[status]}
                </button>
              ),
            )}
          </div>
          <div className="admin-tabs">
            {(["all", "submitted", "missing"] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={
                  questionnaireFilter === status
                    ? "admin-tab active"
                    : "admin-tab"
                }
                onClick={() => {
                  setQuestionnaireFilter(status);
                  setPage(1);
                }}
              >
                {status === "all"
                  ? "全部问卷"
                  : status === "submitted"
                    ? "已填问卷"
                    : "未填问卷"}
              </button>
            ))}
          </div>
          <div className="admin-record-list">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={
                  user.id === selectedUserId
                    ? "admin-record-item admin-record-item-active"
                    : "admin-record-item"
                }
                onClick={() => setSelectedUserId(user.id)}
              >
                <div className="admin-record-topline">
                  <strong>{user.displayName ?? user.email}</strong>
                  <span className="domain-chip">
                    {USER_STATUS_LABELS[user.status]}
                  </span>
                </div>
                <p>{user.email}</p>
                <div className="admin-inline-meta">
                  <span>{user.school?.name ?? "未识别学校"}</span>
                  <span>
                    {user.questionnaireResponse?.submittedAt
                      ? "已填问卷"
                      : "未填问卷"}
                  </span>
                </div>
              </button>
            ))}
            {users.length === 0 ? (
              <div className="admin-empty-state">没有找到匹配的用户。</div>
            ) : null}
          </div>
          {data ? (
            <div className="admin-pagination">
              <button
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
                type="button"
              >
                上一页
              </button>
              <span>
                {data.page} / {data.totalPages} · 共 {data.total} 人
              </span>
              <button
                disabled={data.page >= data.totalPages}
                onClick={() => setPage(data.page + 1)}
                type="button"
              >
                下一页
              </button>
            </div>
          ) : null}
        </article>

        <article className="content-panel admin-detail-panel">
          {selectedUser ? (
            <div className="admin-page-stack">
              <div className="admin-section-header">
                <div>
                  <p className="eyebrow">用户详情</p>
                  <h2>{selectedUser.displayName ?? "未设置昵称"}</h2>
                  <p>{selectedUser.email}</p>
                </div>
                <div className="auth-actions">
                  {(["ACTIVE", "SUSPENDED", "PENDING"] as const).map(
                    (status) => (
                      <button
                        key={status}
                        className={
                          selectedUser.status === status
                            ? "button-primary"
                            : "button-secondary"
                        }
                        type="button"
                        disabled={pending === status}
                        onClick={() => void updateUserStatus(status)}
                      >
                        {pending === status ? "提交中..." : USER_STATUS_LABELS[status]}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="admin-inline-metrics">
                <div>
                  <span>学校</span>
                  <strong>{selectedUser.school?.name ?? "未识别"}</strong>
                </div>
                <div>
                  <span>注册时间</span>
                  <strong>
                    {new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "short",
                    }).format(new Date(selectedUser.createdAt))}
                  </strong>
                </div>
                <div>
                  <span>问卷</span>
                  <strong>
                    {selectedUser.questionnaireResponse?.submittedAt
                      ? "已提交"
                      : "未提交"}
                  </strong>
                </div>
              </div>

              <div className="admin-detail-grid">
                <div>
                  <h3>资料</h3>
                  <p>真实姓名：{selectedUser.profile?.fullName ?? "—"}</p>
                  <p>一句话介绍：{selectedUser.profile?.headline ?? "—"}</p>
                  <p>年级：{selectedUser.profile?.schoolYear ?? "—"}</p>
                  <p>项目 / 专业：{selectedUser.profile?.programName ?? "—"}</p>
                  <p>简介：{selectedUser.profile?.bio ?? "—"}</p>
                </div>
                <div>
                  <h3>最近轮次参与</h3>
                  {selectedUser.participations.length > 0 ? (
                    selectedUser.participations.map((participation) => (
                      <p key={participation.cycleId}>
                        {participation.cycleId} · {participation.status}
                      </p>
                    ))
                  ) : (
                    <p>暂无参与记录。</p>
                  )}
                </div>
              </div>

              <div>
                <h3>问卷回答</h3>
                {selectedUser.questionnaireResponse?.answers ? (
                  <div className="admin-answer-list">
                    {Object.entries(
                      selectedUser.questionnaireResponse.answers,
                    ).map(([key, value]) => (
                      <div key={key}>
                        <span>{ANSWER_LABELS[key] ?? key}</span>
                        <strong>{formatAnswer(value)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="admin-empty-state">
                    该用户还没有提交问卷。
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="admin-empty-state">左侧选择用户后可查看详情。</div>
          )}
        </article>
      </section>
    </div>
  );
}
