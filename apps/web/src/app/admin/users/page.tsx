"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { HARD_MATCH_KEYS } from "../../../lib/hard-match";
import { useAdminCollection } from "../use-admin-collection";
import type { AdminUser } from "../types";

const HARD_MATCH_LABELS: Record<string, string> = {
  [HARD_MATCH_KEYS.birthDate]: "出生年月日",
  [HARD_MATCH_KEYS.partnerAgeMin]: "希望对方年龄下限",
  [HARD_MATCH_KEYS.partnerAgeMax]: "希望对方年龄上限",
  [HARD_MATCH_KEYS.gender]: "你的性别",
  [HARD_MATCH_KEYS.partnerGenders]: "希望对方的性别",
  [HARD_MATCH_KEYS.looks]: "颜值自评",
  [HARD_MATCH_KEYS.partnerLooks]: "希望对方的颜值",
  [HARD_MATCH_KEYS.heightCm]: "身高（厘米）",
  [HARD_MATCH_KEYS.partnerHeightMin]: "希望对方身高下限",
  [HARD_MATCH_KEYS.partnerHeightMax]: "希望对方身高上限",
  [HARD_MATCH_KEYS.oneLinerIntro]: "一句话介绍",
};

const HARD_MATCH_KEY_SET = new Set(Object.keys(HARD_MATCH_LABELS));

const USER_STATUS_LABELS: Record<"ALL" | AdminUser["status"], string> = {
  ALL: "全部",
  ACTIVE: "正常",
  PENDING: "待激活",
  SUSPENDED: "已停用",
};

type DetailTab = "profile" | "questionnaire" | "cycles";

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

type EditForm = {
  displayName: string;
  email: string;
  fullName: string;
  headline: string;
  schoolYear: string;
  programName: string;
  bio: string;
};

function buildEditForm(user: AdminUser): EditForm {
  return {
    displayName: user.displayName ?? "",
    email: user.email,
    fullName: user.profile?.fullName ?? "",
    headline: user.profile?.headline ?? "",
    schoolYear: user.profile?.schoolYear ?? "",
    programName: user.profile?.programName ?? "",
    bio: user.profile?.bio ?? "",
  };
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminUser["status"]>("ALL");
  const [questionnaireFilter, setQuestionnaireFilter] = useState<"all" | "submitted" | "missing">("all");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

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
    if (!users.length) { setSelectedUserId(null); return; }
    if (!selectedUserId || !users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  useEffect(() => {
    setDetailTab("profile");
    setEditing(false);
    setEditForm(null);
  }, [selectedUserId]);

  const answerGroups = useMemo(() => {
    const answers = selectedUser?.questionnaireResponse?.answers;
    if (!answers || typeof answers !== "object") return null;

    const entries = Object.entries(answers as Record<string, unknown>);
    const hardMatch = entries.filter(([k]) => HARD_MATCH_KEY_SET.has(k));
    const questionnaire = entries.filter(([k]) => !HARD_MATCH_KEY_SET.has(k));
    return { hardMatch, questionnaire, total: entries.length };
  }, [selectedUser]);

  function startEditing() {
    if (!selectedUser) return;
    setEditForm(buildEditForm(selectedUser));
    setEditing(true);
    setActionError(null);
  }

  function cancelEditing() {
    setEditing(false);
    setEditForm(null);
    setActionError(null);
  }

  async function saveEdit() {
    if (!selectedUser || !editForm) return;
    setPending("edit");
    setActionError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (editForm.displayName !== (selectedUser.displayName ?? "")) payload.displayName = editForm.displayName || null;
      if (editForm.email !== selectedUser.email) payload.email = editForm.email;
      if (editForm.fullName !== (selectedUser.profile?.fullName ?? "")) payload.fullName = editForm.fullName || null;
      if (editForm.headline !== (selectedUser.profile?.headline ?? "")) payload.headline = editForm.headline || null;
      if (editForm.schoolYear !== (selectedUser.profile?.schoolYear ?? "")) payload.schoolYear = editForm.schoolYear || null;
      if (editForm.programName !== (selectedUser.profile?.programName ?? "")) payload.programName = editForm.programName || null;
      if (editForm.bio !== (selectedUser.profile?.bio ?? "")) payload.bio = editForm.bio || null;

      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      await fetchApi(`/admin/users/${selectedUser.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setEditing(false);
      setEditForm(null);
      await refresh();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "用户信息更新失败。");
    } finally {
      setPending(null);
    }
  }

  async function updateUserStatus(status: AdminUser["status"]) {
    if (!selectedUser) return;
    setPending(status);
    setActionError(null);
    try {
      await fetchApi(`/admin/users/${selectedUser.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "用户状态更新失败。");
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载用户中心...</div>;
  }

  return (
    <div className="qb-container" style={{ maxWidth: "72rem" }}>
      <div className="qb-header">
        <div>
          <h1>用户中心</h1>
          <p className="qb-header-desc">定位用户，查看资料、问卷与轮次参与状态，处理账号。</p>
        </div>
        <button
          className="button-secondary"
          onClick={() => void refresh()}
          type="button"
          style={{ minHeight: "2.4rem", padding: "0 1rem" }}
        >
          刷新
        </button>
      </div>

      {error && <p className="form-error" style={{ marginBottom: "0.75rem" }}>{error}</p>}
      {actionError && <p className="form-error" style={{ marginBottom: "0.75rem" }}>{actionError}</p>}

      <section className="admin-workspace-grid">
        {/* ── User list ─── */}
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
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="搜索邮箱、昵称、姓名、学校或状态"
            />
          </div>
          <div className="admin-tabs">
            {(["ALL", "ACTIVE", "PENDING", "SUSPENDED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={statusFilter === s ? "admin-tab active" : "admin-tab"}
                onClick={() => { setStatusFilter(s); setPage(1); }}
              >
                {USER_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="admin-tabs">
            {(["all", "submitted", "missing"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={questionnaireFilter === s ? "admin-tab active" : "admin-tab"}
                onClick={() => { setQuestionnaireFilter(s); setPage(1); }}
              >
                {s === "all" ? "全部问卷" : s === "submitted" ? "已填问卷" : "未填问卷"}
              </button>
            ))}
          </div>
          <div className="admin-record-list">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={user.id === selectedUserId ? "admin-record-item admin-record-item-active" : "admin-record-item"}
                onClick={() => setSelectedUserId(user.id)}
              >
                <div className="admin-record-topline">
                  <strong>{user.displayName ?? user.email}</strong>
                  <span className="domain-chip">{USER_STATUS_LABELS[user.status]}</span>
                </div>
                <p>{user.email}</p>
                <div className="admin-inline-meta">
                  <span>{user.school?.name ?? "未识别学校"}</span>
                  <span>{user.questionnaireResponse?.submittedAt ? "已填问卷" : "未填问卷"}</span>
                </div>
              </button>
            ))}
            {users.length === 0 && <div className="admin-empty-state">没有找到匹配的用户。</div>}
          </div>
          {data && (
            <div className="admin-pagination">
              <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">上一页</button>
              <span>{data.page} / {data.totalPages} · 共 {data.total} 人</span>
              <button disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)} type="button">下一页</button>
            </div>
          )}
        </article>

        {/* ── User detail ─── */}
        <article className="content-panel admin-detail-panel">
          {selectedUser ? (
            <div className="admin-page-stack">
              {/* Header + status buttons */}
              <div className="admin-section-header">
                <div>
                  <p className="eyebrow">用户详情</p>
                  <h2>{selectedUser.displayName ?? "未设置昵称"}</h2>
                  <p>{selectedUser.email}</p>
                </div>
                <div className="auth-actions">
                  {(["ACTIVE", "SUSPENDED", "PENDING"] as const).map((s) => (
                    <button
                      key={s}
                      className={selectedUser.status === s ? "button-primary" : "button-secondary"}
                      type="button"
                      disabled={pending === s}
                      onClick={() => void updateUserStatus(s)}
                      style={{ minHeight: "2rem", padding: "0 0.75rem", fontSize: "0.82rem" }}
                    >
                      {pending === s ? "提交中…" : USER_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary metrics */}
              <div className="admin-inline-metrics">
                <div><span>学校</span><strong>{selectedUser.school?.name ?? "未识别"}</strong></div>
                <div>
                  <span>注册时间</span>
                  <strong>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "short" }).format(new Date(selectedUser.createdAt))}</strong>
                </div>
                <div>
                  <span>问卷</span>
                  <strong>{selectedUser.questionnaireResponse?.submittedAt ? "已提交" : "未提交"}</strong>
                </div>
                <div>
                  <span>轮次参与</span>
                  <strong>{selectedUser.participations.length}</strong>
                </div>
              </div>

              {/* Detail tabs */}
              <div className="admin-tabs">
                {([
                  { key: "profile" as const, label: "基本资料" },
                  { key: "questionnaire" as const, label: `问卷回答${answerGroups ? ` (${answerGroups.total})` : ""}` },
                  { key: "cycles" as const, label: `轮次参与 (${selectedUser.participations.length})` },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={detailTab === tab.key ? "admin-tab active" : "admin-tab"}
                    onClick={() => setDetailTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Profile ─── */}
              {detailTab === "profile" && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {editing && editForm ? (
                    <div className="admin-page-stack">
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <tbody>
                            <tr>
                              <td style={{ fontWeight: 600, width: "8rem" }}>昵称</td>
                              <td><input value={editForm.displayName} onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>邮箱</td>
                              <td><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>真实姓名</td>
                              <td><input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>一句话介绍</td>
                              <td><input value={editForm.headline} onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>年级</td>
                              <td><input value={editForm.schoolYear} onChange={(e) => setEditForm({ ...editForm, schoolYear: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>项目 / 专业</td>
                              <td><input value={editForm.programName} onChange={(e) => setEditForm({ ...editForm, programName: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: 600 }}>简介</td>
                              <td><textarea value={editForm.bio} rows={3} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} style={{ width: "100%" }} /></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="auth-actions">
                        <button className="button-primary" type="button" disabled={pending === "edit"} onClick={() => void saveEdit()}>
                          {pending === "edit" ? "保存中…" : "保存修改"}
                        </button>
                        <button className="button-secondary" type="button" onClick={cancelEditing}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-page-stack">
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <tbody>
                            <tr><td style={{ fontWeight: 600, width: "8rem" }}>昵称</td><td>{selectedUser.displayName ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>真实姓名</td><td>{selectedUser.profile?.fullName ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>一句话介绍</td><td>{selectedUser.profile?.headline ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>年级</td><td>{selectedUser.profile?.schoolYear ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>项目 / 专业</td><td>{selectedUser.profile?.programName ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>简介</td><td>{selectedUser.profile?.bio ?? "—"}</td></tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="auth-actions">
                        <button className="button-secondary" type="button" onClick={startEditing} style={{ minHeight: "2rem", padding: "0 0.75rem", fontSize: "0.82rem" }}>
                          编辑资料
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Questionnaire ─── */}
              {detailTab === "questionnaire" && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {answerGroups ? (
                    <div className="admin-page-stack">
                      {/* Hard-match answers */}
                      {answerGroups.hardMatch.length > 0 && (
                        <>
                          <h3 style={{ margin: 0 }}>硬性条件</h3>
                          <div className="admin-table-wrap">
                            <table className="admin-table">
                              <thead>
                                <tr><th>项目</th><th>回答</th></tr>
                              </thead>
                              <tbody>
                                {answerGroups.hardMatch.map(([key, value]) => (
                                  <tr key={key}>
                                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{HARD_MATCH_LABELS[key] ?? key}</td>
                                    <td>{formatAnswer(value)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}

                      {/* Dynamic questionnaire answers */}
                      {answerGroups.questionnaire.length > 0 && (
                        <>
                          <h3 style={{ margin: 0 }}>价值观问卷</h3>
                          <div className="admin-table-wrap">
                            <table className="admin-table">
                              <thead>
                                <tr><th>题目 Key</th><th>回答</th></tr>
                              </thead>
                              <tbody>
                                {answerGroups.questionnaire.map(([key, value]) => (
                                  <tr key={key}>
                                    <td style={{ fontWeight: 500 }}>{key}</td>
                                    <td>{formatAnswer(value)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="admin-empty-state">该用户还没有提交问卷。</div>
                  )}
                </div>
              )}

              {/* ── Tab: Cycles ─── */}
              {detailTab === "cycles" && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {selectedUser.participations.length > 0 ? (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr><th>轮次 ID</th><th>状态</th></tr>
                        </thead>
                        <tbody>
                          {selectedUser.participations.map((p) => (
                            <tr key={p.cycleId}>
                              <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{p.cycleId}</td>
                              <td><span className="domain-chip">{p.status === "OPTED_IN" ? "已参加" : "未参加"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="admin-empty-state">暂无轮次参与记录。</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="admin-empty-state">左侧选择用户后可查看详情。</div>
          )}
        </article>
      </section>
    </div>
  );
}
