"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { HARD_MATCH_KEYS } from "../../../lib/hard-match";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type {
  AdminSchool,
  AdminUser,
  AdminUserDetail,
  AdminUserParticipation,
  AdminUserQuestionnaire,
  PaginatedResult,
} from "../types";

const adminStyles = [commonStyles];

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
  [HARD_MATCH_KEYS.school]: "你的学校",
  [HARD_MATCH_KEYS.excludedPartnerSchools]: "不希望对方的学校",
  [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: "学校内排除的性别",
};

const HARD_MATCH_KEY_SET = new Set(Object.keys(HARD_MATCH_LABELS));

const USER_STATUS_LABELS: Record<"ALL" | AdminUser["status"], string> = {
  ALL: "全部",
  ACTIVE: "正常",
  PENDING: "待激活",
  SUSPENDED: "已停用",
};

/** Matches API `ADMIN_LIST_PAGE_SIZE_MAX` (input-limits.ts). */
const ADMIN_SCHOOL_LOOKUP_PAGE_SIZE = 50;

/** Matches slim list API: six rows per page, full questionnaire loaded per user via detail endpoint. */
const ADMIN_USERS_PAGE_SIZE = 6;


type DetailTab = "profile" | "questionnaire" | "cycles";

function formatAnswer(
  key: string,
  value: unknown,
  schoolNameById: Record<string, string>,
): string {
  if (key === HARD_MATCH_KEYS.school && typeof value === "string") {
    return schoolNameById[value] ?? value;
  }

  if (key === HARD_MATCH_KEYS.excludedPartnerSchools && Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? (schoolNameById[item] ?? item) : String(item),
      )
      .join("、");
  }

  if (
    key === HARD_MATCH_KEYS.excludedPartnerSchoolGenders &&
    Array.isArray(value)
  ) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return String(item);
        }

        const record = item as {
          schoolId?: unknown;
          genders?: unknown;
        };
        const schoolName =
          typeof record.schoolId === "string"
            ? (schoolNameById[record.schoolId] ?? record.schoolId)
            : "未知学校";
        const genders = Array.isArray(record.genders)
          ? record.genders
              .filter((gender): gender is string => typeof gender === "string")
              .join("、")
          : "";

        return genders ? `${schoolName}（${genders}）` : schoolName;
      })
      .join("；");
  }

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

function formatNonEduReferralQuota(user: AdminUser) {
  const remaining = Math.max(0, user.nonEduReferralLimit - user.nonEduReferralUses);
  return `已用 ${user.nonEduReferralUses} / 上限 ${user.nonEduReferralLimit} · 剩余 ${remaining}`;
}

export default function AdminUsersPage() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminUser["status"]>("ALL");
  const [questionnaireFilter, setQuestionnaireFilter] = useState<"all" | "submitted" | "missing">("all");
  const [userTypeFilter, setUserTypeFilter] = useState<"all" | "test" | "real">("all");
  const [genderFilter, setGenderFilter] = useState<"all" | "男" | "女" | "非二元">("all");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editingReferralLimit, setEditingReferralLimit] = useState(false);
  const [referralLimitDraft, setReferralLimitDraft] = useState("");
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [questionnaireData, setQuestionnaireData] = useState<AdminUserQuestionnaire>(null);
  const [participationsData, setParticipationsData] = useState<PaginatedResult<AdminUserParticipation> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [questionnaireLoading, setQuestionnaireLoading] = useState(false);
  const [participationsLoading, setParticipationsLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [schoolNameById, setSchoolNameById] = useState<Record<string, string>>({});

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AdminUser>(
    "/admin/users",
    {
      page,
      pageSize: ADMIN_USERS_PAGE_SIZE,
      search: submittedSearch.trim(),
      status: statusFilter === "ALL" ? undefined : statusFilter,
      questionnaire: questionnaireFilter,
      userType: userTypeFilter,
      gender: genderFilter,
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
  const activeUserDetail =
    userDetail && userDetail.id === selectedUserId ? userDetail : null;
  const displayUser = activeUserDetail ?? selectedUser;
  const effectiveDetailTab =
    activeUserDetail && activeUserDetail.id === selectedUserId
      ? detailTab
      : "profile";

  useEffect(() => {
    let cancelled = false;

    void fetchApi<PaginatedResult<AdminSchool>>(
      `/admin/schools?page=1&pageSize=${ADMIN_SCHOOL_LOOKUP_PAGE_SIZE}`,
    )
      .then((payload) => {
        if (cancelled) return;
        setSchoolNameById(
          Object.fromEntries(payload.items.map((school) => [school.id, school.name])),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSchoolNameById({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setUserDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    void fetchApi<AdminUserDetail>(`/admin/users/${selectedUserId}`)
      .then((user) => {
        if (!cancelled) setUserDetail(user);
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setUserDetail(null);
          setDetailError(
            caughtError instanceof Error
              ? caughtError.message
              : "加载用户详情失败。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  async function reloadUserDetail() {
    if (!selectedUserId) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const user = await fetchApi<AdminUserDetail>(`/admin/users/${selectedUserId}`);
      setUserDetail(user);
    } catch (caughtError) {
      setUserDetail(null);
      setDetailError(
        caughtError instanceof Error
          ? caughtError.message
          : "加载用户详情失败。",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    setDetailTab("profile");
    setEditing(false);
    setEditForm(null);
    setEditingReferralLimit(false);
    setReferralLimitDraft("");
    setActionMessage(null);
    setQuestionnaireData(null);
    setParticipationsData(null);
  }, [selectedUserId]);

  const questionnaireAnswerCount = useMemo(() => {
    if (activeUserDetail) {
      return activeUserDetail.questionnaireAnswerCount;
    }

    return null;
  }, [activeUserDetail]);

  const answerGroups = useMemo(() => {
    if (effectiveDetailTab !== "questionnaire") return null;
    const answers = questionnaireData?.answers;
    if (!answers || typeof answers !== "object") return null;

    const entries = Object.entries(answers as Record<string, unknown>);
    const hardMatch = entries.filter(([k]) => HARD_MATCH_KEY_SET.has(k));
    const questionnaire = entries.filter(([k]) => !HARD_MATCH_KEY_SET.has(k));
    return { hardMatch, questionnaire, total: entries.length };
  }, [effectiveDetailTab, questionnaireData]);

  useEffect(() => {
    if (detailTab !== "questionnaire" || !selectedUserId) {
      return;
    }

    let cancelled = false;
    setQuestionnaireLoading(true);

    void fetchApi<AdminUserQuestionnaire>(`/admin/users/${selectedUserId}/questionnaire`)
      .then((payload) => {
        if (!cancelled) {
          setQuestionnaireData(payload);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setActionError(
            caughtError instanceof Error
              ? caughtError.message
              : "问卷详情加载失败。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setQuestionnaireLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailTab, selectedUserId]);

  useEffect(() => {
    if (detailTab !== "cycles" || !selectedUserId) {
      return;
    }

    let cancelled = false;
    setParticipationsLoading(true);

    void fetchApi<PaginatedResult<AdminUserParticipation>>(
      `/admin/users/${selectedUserId}/participations?page=1&pageSize=${ADMIN_SCHOOL_LOOKUP_PAGE_SIZE}`,
    )
      .then((payload) => {
        if (!cancelled) {
          setParticipationsData(payload);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setActionError(
            caughtError instanceof Error
              ? caughtError.message
              : "轮次参与记录加载失败。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setParticipationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detailTab, selectedUserId]);

  function startEditing() {
    if (!selectedUser) return;
    setEditForm(buildEditForm(selectedUser));
    setEditing(true);
    setActionError(null);
    setActionMessage(null);
  }

  function cancelEditing() {
    setEditing(false);
    setEditForm(null);
    setActionError(null);
  }

  function startEditingReferralLimit() {
    if (!displayUser) return;
    setReferralLimitDraft(String(displayUser.nonEduReferralLimit));
    setEditingReferralLimit(true);
    setActionError(null);
    setActionMessage(null);
  }

  function cancelEditingReferralLimit() {
    setEditingReferralLimit(false);
    setReferralLimitDraft("");
    setActionError(null);
  }

  async function saveEdit() {
    if (!selectedUser || !editForm) return;
    setPending("edit");
    setActionError(null);
    setActionMessage(null);
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
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditing(false);
      setEditForm(null);
      await refresh();
      await reloadUserDetail();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "用户信息更新失败。");
    } finally {
      setPending(null);
    }
  }

  async function saveReferralLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayUser) return;

    const trimmedDraft = referralLimitDraft.trim();
    const nextLimit = Number(trimmedDraft);
    if (
      !trimmedDraft ||
      !Number.isInteger(nextLimit) ||
      nextLimit < 0 ||
      nextLimit > 100000
    ) {
      // Guard the empty/blank case explicitly: Number("") === 0 would otherwise
      // silently revoke the user's quota instead of being rejected as no input.
      setActionError("普通邮箱邀请码额度上限必须是 0 到 100000 之间的整数。");
      return;
    }

    const userId = displayUser.id;
    setPending("referral-limit");
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/users/${userId}/referral-limit`, {
        method: "PATCH",
        body: JSON.stringify({ nonEduReferralLimit: nextLimit }),
      });
      setEditingReferralLimit(false);
      setReferralLimitDraft("");
      setActionMessage("普通邮箱邀请码额度已更新。");
      await refresh();
      await reloadUserDetail();
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "普通邮箱邀请码额度更新失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function toggleTestFlag() {
    if (!selectedUser) return;
    const nextValue = !selectedUser.isTest;
    setPending("test-flag");
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/users/${selectedUser.id}/test-flag`, {
        method: "PUT",
        body: JSON.stringify({ isTest: nextValue }),
      });
      await refresh();
      await reloadUserDetail();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  async function deleteAllTestUsers() {
    if (!confirm("确定删除所有标记为「测试用户」的账号？\n此操作会删除这些用户的所有数据（问卷、匹配记录、举报等），且不可撤回。")) return;
    setPending("delete-test");
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await fetchApi<{ deletedCount: number }>("/admin/users/test-users", { method: "DELETE" });
      setActionError(null);
      setSelectedUserId(null);
      await refresh();
      alert(`已删除 ${result.deletedCount} 个测试用户。`);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "删除失败。");
    } finally {
      setPending(null);
    }
  }

  async function updateUserStatus(status: AdminUser["status"]) {
    if (!selectedUser) return;
    setPending(status);
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/users/${selectedUser.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await refresh();
      await reloadUserDetail();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "用户状态更新失败。");
    } finally {
      setPending(null);
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  if (loading) {
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载用户中心...</div>;
  }

  return (
    <div className={cx(adminStyles, "qb-container admin-wide-container")}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>用户中心</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>定位用户，查看资料、问卷与轮次参与状态，处理账号。</p>
        </div>
        <button
          className={cx(adminStyles, "ui-button ui-button--secondary admin-refresh-control")}
          onClick={() => void refresh()}
          type="button"
        >
          刷新
        </button>
      </div>

      {error && <p className={cx(adminStyles, "ui-form-message ui-form-message--error admin-message-bottom-sm")}>{error}</p>}
      {actionError && <p className={cx(adminStyles, "ui-form-message ui-form-message--error admin-message-bottom-sm")}>{actionError}</p>}
      {actionMessage && <p className={cx(adminStyles, "ui-form-message ui-form-message--success admin-message-bottom-sm")}>{actionMessage}</p>}

      <section className={cx(adminStyles, "admin-workspace-grid")}>
        {/* ── User list ─── */}
        <article className={cx(adminStyles, "ui-card ui-card--padded ui-card--plain admin-list-panel")}>
          <div className={cx(adminStyles, "admin-section-header")}>
            <div>
              <p className="eyebrow">用户列表</p>
              <h2>全部用户</h2>
            </div>
          </div>
          <form className={cx(adminStyles, "admin-search-bar")} onSubmit={handleSearchSubmit}>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="搜索邮箱、昵称、姓名、学校或状态"
            />
          </form>
          <div className={cx(adminStyles, "admin-tabs")}>
            {(["ALL", "ACTIVE", "PENDING", "SUSPENDED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={statusFilter === s ? "ui-segmented-item active" : "ui-segmented-item"}
                onClick={() => { setStatusFilter(s); setPage(1); }}
              >
                {USER_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className={cx(adminStyles, "admin-tabs")}>
            {(["all", "submitted", "missing"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={questionnaireFilter === s ? "ui-segmented-item active" : "ui-segmented-item"}
                onClick={() => { setQuestionnaireFilter(s); setPage(1); }}
              >
                {s === "all" ? "全部问卷" : s === "submitted" ? "已填问卷" : "未填问卷"}
              </button>
            ))}
          </div>
          <div className={cx(adminStyles, "admin-tabs admin-tabs-with-actions")}>
            {(["all", "real", "test"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={userTypeFilter === t ? "ui-segmented-item active" : "ui-segmented-item"}
                onClick={() => { setUserTypeFilter(t); setPage(1); }}
              >
                {t === "all" ? "全部用户" : t === "real" ? "真实用户" : "测试用户"}
              </button>
            ))}
            {userTypeFilter === "test" && (
              <button
                className={cx(adminStyles, "ui-button ui-button--secondary admin-test-delete-control")}
                type="button"
                disabled={pending === "delete-test"}
                onClick={() => void deleteAllTestUsers()}
              >
                {pending === "delete-test" ? "删除中…" : "删除全部测试用户"}
              </button>
            )}
          </div>
          <div className={cx(adminStyles, "admin-tabs")}>
            {(["all", "男", "女", "非二元"] as const).map((g) => (
              <button
                key={g}
                type="button"
                className={genderFilter === g ? "ui-segmented-item active" : "ui-segmented-item"}
                onClick={() => { setGenderFilter(g); setPage(1); }}
              >
                {g === "all" ? "全部性别" : g}
              </button>
            ))}
          </div>
          <div className={cx(adminStyles, "admin-record-list")}>
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className={cx(
                  adminStyles,
                  "admin-record-item",
                  user.id === selectedUserId && "admin-record-item-active",
                )}
                onClick={() => setSelectedUserId(user.id)}
              >
                <div className={cx(adminStyles, "admin-record-topline")}>
                  <strong>{user.displayName ?? user.email}</strong>
                  {user.isTest && <span className={cx(adminStyles, "ui-badge ui-badge--neutral admin-test-badge")}>测试</span>}
                  <span className="ui-badge ui-badge--neutral">{USER_STATUS_LABELS[user.status]}</span>
                </div>
                <p>{user.email}</p>
                <div className={cx(adminStyles, "admin-inline-meta")}>
                  <span>{user.school?.name ?? "未识别学校"}</span>
                  <span>{user.questionnaireResponse?.submittedAt ? "已填问卷" : "未填问卷"}</span>
                  <span>普通邮箱邀请码：{formatNonEduReferralQuota(user)}</span>
                </div>
              </button>
            ))}
            {users.length === 0 && <div className={cx(adminStyles, "admin-empty-state")}>没有找到匹配的用户。</div>}
          </div>
          {data && (
            <AdminPagination
              className={cx(adminStyles, "admin-pagination")}
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              unit="人"
              onPageChange={setPage}
            />
          )}
        </article>

        {/* ── User detail ─── */}
        <article className={cx(adminStyles, "ui-card ui-card--padded ui-card--plain admin-detail-panel")}>
          {displayUser ? (
            <div className={cx(adminStyles, "admin-page-stack")}>
              {detailError ? (
                <p className="ui-form-message ui-form-message--error" role="alert">
                  {detailError}
                </p>
              ) : null}
              {/* Header + status buttons */}
              <div className={cx(adminStyles, "admin-section-header")}>
                <div>
                  <p className="eyebrow">用户详情{displayUser.isTest ? " · 测试用户" : ""}</p>
                  <h2>{displayUser.displayName ?? "未设置昵称"}</h2>
                  <p>{displayUser.email}</p>
                </div>
                <div className="auth-actions">
                  {(["ACTIVE", "SUSPENDED", "PENDING"] as const).map((s) => (
                    <button
                      key={s}
                      className={displayUser.status === s ? "ui-button ui-button--primary" : "ui-button ui-button--secondary"}
                      type="button"
                      disabled={pending === s}
                      onClick={() => void updateUserStatus(s)}
                    >
                      {pending === s ? "提交中…" : USER_STATUS_LABELS[s]}
                    </button>
                  ))}
                  <button
                    className={displayUser.isTest ? "ui-button ui-button--primary" : "ui-button ui-button--secondary"}
                    type="button"
                    disabled={pending === "test-flag"}
                    onClick={() => void toggleTestFlag()}
                  >
                    {pending === "test-flag" ? "更新中…" : displayUser.isTest ? "取消测试标记" : "标记为测试"}
                  </button>
                </div>
              </div>

              {/* Summary metrics */}
              <div className={cx(adminStyles, "admin-inline-metrics")}>
                <div><span>学校</span><strong>{displayUser.school?.name ?? "未识别"}</strong></div>
                <div>
                  <span>注册时间</span>
                  <strong>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "short" }).format(new Date(displayUser.createdAt))}</strong>
                </div>
                <div>
                  <span>问卷</span>
                  <strong>{displayUser.questionnaireResponse?.submittedAt ? "已提交" : "未提交"}</strong>
                </div>
                <div>
                  <span>轮次参与</span>
                  <strong>{detailLoading || !userDetail ? "…" : userDetail.participationCount}</strong>
                </div>
              </div>

              <div className={cx(adminStyles, "admin-review-box")}>
                <div className={cx(adminStyles, "admin-section-header admin-section-header-tight")}>
                  <div>
                    <h3>普通邮箱邀请码额度</h3>
                    <p>{formatNonEduReferralQuota(displayUser)}</p>
                  </div>
                  {!editingReferralLimit ? (
                    <button
                      className="ui-button ui-button--secondary"
                      type="button"
                      onClick={startEditingReferralLimit}
                    >
                      调整额度
                    </button>
                  ) : null}
                </div>
                {editingReferralLimit ? (
                  <form className={cx(adminStyles, "admin-form-grid")} onSubmit={saveReferralLimit}>
                    <label>
                      <span>普通邮箱邀请码额度上限</span>
                      <input
                        className={cx(adminStyles, "admin-full-control")}
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={referralLimitDraft}
                        onChange={(event) => setReferralLimitDraft(event.target.value)}
                      />
                    </label>
                    <div className="auth-actions">
                      <button
                        className="ui-button ui-button--primary"
                        type="submit"
                        disabled={pending === "referral-limit"}
                      >
                        {pending === "referral-limit" ? "保存中…" : "保存额度"}
                      </button>
                      <button
                        className="ui-button ui-button--secondary"
                        type="button"
                        disabled={pending === "referral-limit"}
                        onClick={cancelEditingReferralLimit}
                      >
                        取消
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              {/* Detail tabs */}
              <div className={cx(adminStyles, "admin-tabs")}>
                {([
                  { key: "profile" as const, label: "基本资料" },
                  {
                    key: "questionnaire" as const,
                    label: `问卷回答${questionnaireAnswerCount != null ? ` (${questionnaireAnswerCount})` : ""}`,
                  },
                  { key: "cycles" as const, label: `轮次参与 (${userDetail?.participationCount ?? 0})` },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={effectiveDetailTab === tab.key ? "ui-segmented-item active" : "ui-segmented-item"}
                    onClick={() => setDetailTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── Tab: Profile ─── */}
              {effectiveDetailTab === "profile" && (
                <div className={cx(adminStyles, "admin-fade-panel")}>
                  {editing && editForm ? (
                    <div className={cx(adminStyles, "admin-page-stack")}>
                      <div className={cx(adminStyles, "admin-table-wrap")}>
                        <table className={cx(adminStyles, "admin-table")}>
                          <tbody>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label-wide")}>昵称</td>
                              <td><input value={editForm.displayName} onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label")}>邮箱</td>
                              <td><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label")}>真实姓名</td>
                              <td><input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label")}>一句话介绍</td>
                              <td><input value={editForm.headline} onChange={(e) => setEditForm({ ...editForm, headline: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label")}>年级</td>
                              <td><input value={editForm.schoolYear} onChange={(e) => setEditForm({ ...editForm, schoolYear: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label")}>项目 / 专业</td>
                              <td><input value={editForm.programName} onChange={(e) => setEditForm({ ...editForm, programName: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                            <tr>
                              <td className={cx(adminStyles, "admin-table-label")}>简介</td>
                              <td><textarea value={editForm.bio} rows={3} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} className={cx(adminStyles, "admin-full-control")} /></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="auth-actions">
                        <button className="ui-button ui-button--primary" type="button" disabled={pending === "edit"} onClick={() => void saveEdit()}>
                          {pending === "edit" ? "保存中…" : "保存修改"}
                        </button>
                        <button className="ui-button ui-button--secondary" type="button" onClick={cancelEditing}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className={cx(adminStyles, "admin-page-stack")}>
                      <div className={cx(adminStyles, "admin-table-wrap")}>
                        <table className={cx(adminStyles, "admin-table")}>
                          <tbody>
                            <tr><td style={{ fontWeight: 600, width: "8rem" }}>昵称</td><td>{displayUser.displayName ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>真实姓名</td><td>{displayUser.profile?.fullName ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>一句话介绍</td><td>{displayUser.profile?.headline ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>年级</td><td>{displayUser.profile?.schoolYear ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>项目 / 专业</td><td>{displayUser.profile?.programName ?? "—"}</td></tr>
                            <tr><td style={{ fontWeight: 600 }}>简介</td><td>{displayUser.profile?.bio ?? "—"}</td></tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="auth-actions">
                        <button className="ui-button ui-button--secondary" type="button" onClick={startEditing} style={{ minHeight: "2rem", padding: "0 0.75rem", fontSize: "0.82rem" }}>
                          编辑资料
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Questionnaire ─── */}
              {effectiveDetailTab === "questionnaire" && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {answerGroups ? (
                    <div className={cx(adminStyles, "admin-page-stack")}>
                      {/* Hard-match answers */}
                      {answerGroups.hardMatch.length > 0 && (
                        <>
                          <h3 style={{ margin: 0 }}>硬性条件</h3>
                          <div className={cx(adminStyles, "admin-table-wrap")}>
                            <table className={cx(adminStyles, "admin-table")}>
                              <thead>
                                <tr><th>项目</th><th>回答</th></tr>
                              </thead>
                              <tbody>
                                {answerGroups.hardMatch.map(([key, value]) => (
                                  <tr key={key}>
                                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{HARD_MATCH_LABELS[key] ?? key}</td>
                                    <td>{formatAnswer(key, value, schoolNameById)}</td>
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
                          <div className={cx(adminStyles, "admin-table-wrap")}>
                            <table className={cx(adminStyles, "admin-table")}>
                              <thead>
                                <tr><th>题目 Key</th><th>回答</th></tr>
                              </thead>
                              <tbody>
                                {answerGroups.questionnaire.map(([key, value]) => (
                                  <tr key={key}>
                                    <td style={{ fontWeight: 500 }}>{key}</td>
                                    <td>{formatAnswer(key, value, schoolNameById)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : questionnaireLoading ? (
                    <div className={cx(adminStyles, "admin-empty-state")}>正在加载问卷详情…</div>
                  ) : !displayUser.questionnaireResponse?.submittedAt ? (
                    <div className={cx(adminStyles, "admin-empty-state")}>该用户还没有提交问卷。</div>
                  ) : (
                    <div className={cx(adminStyles, "admin-empty-state")}>问卷答案暂时无法显示，请稍后重试。</div>
                  )}
                </div>
              )}

              {/* ── Tab: Cycles ─── */}
              {effectiveDetailTab === "cycles" && (
                <div style={{ animation: "fadeIn 0.2s ease" }}>
                  {participationsLoading ? (
                    <div className={cx(adminStyles, "admin-empty-state")}>正在加载轮次参与记录…</div>
                  ) : participationsData && participationsData.items.length > 0 ? (
                    <div className={cx(adminStyles, "admin-table-wrap")}>
                      <table className={cx(adminStyles, "admin-table")}>
                        <thead>
                          <tr><th>轮次 ID</th><th>状态</th></tr>
                        </thead>
                        <tbody>
                          {participationsData.items.map((p) => (
                            <tr key={p.cycleId}>
                              <td style={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{p.cycleId}</td>
                              <td><span className="ui-badge ui-badge--neutral">{p.status === "OPTED_IN" ? "已参加" : "未参加"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={cx(adminStyles, "admin-empty-state")}>暂无轮次参与记录。</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={cx(adminStyles, "admin-empty-state")}>左侧选择用户后可查看详情。</div>
          )}
        </article>
      </section>
    </div>
  );
}
