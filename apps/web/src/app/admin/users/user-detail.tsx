import { UserProfile } from "./user-profile";
import { UserHistory } from "./user-history";
import { cx } from "../admin-class-names";
import { AdminDetailDialog } from "../admin-detail-dialog";
import styles from "./users.module.css";
import {
  adminStyles,
  USER_STATUS_LABELS,
  USER_STATUS_DESCRIPTIONS,
  formatNonEduReferralQuota,
} from "./user-display";
import type { AdminUsersModel } from "./use-admin-users";

export function UserDetail({ model }: { model: AdminUsersModel }) {
  const {
    selectedUserId,
    setSelectedUserId,
    setDetailTab,
    userDetail,
    detailLoading,
    detailError,
    displayUser,
    effectiveDetailTab,
    questionnaireAnswerCount,
    pending,
    editingReferralLimit,
    referralLimitDraft,
    setReferralLimitDraft,
    statusAction,
    startEditingReferralLimit,
    cancelEditingReferralLimit,
    saveReferralLimit,
    toggleTestFlag,
    updateUserStatus,
    actionError,
    actionMessage,
  } = model;
  return (
    <AdminDetailDialog open={!!selectedUserId} onClose={() => setSelectedUserId(null)}>
        {displayUser ? (
          <div className={cx(adminStyles, "admin-page-stack")}>
            {detailError ? (
              <p className="ui-form-message ui-form-message--error" role="alert">
                {detailError}
              </p>
            ) : null}
            {/* Account identity */}
            <div className={cx(adminStyles, "admin-section-header")}>
              <div>
                <p className="eyebrow">用户详情{displayUser.isTest ? " · 测试用户" : ""}</p>
                <h2>{displayUser.displayName ?? "未设置昵称"}</h2>
                <p>{displayUser.email}</p>
              </div>
              <div className="auth-actions">
                <button
                  className="ui-button ui-button--secondary"
                  type="button"
                  disabled={!!pending}
                  onClick={() => void toggleTestFlag()}
                >
                  {pending === "test-flag"
                    ? "更新中…"
                    : displayUser.isTest
                      ? "取消测试标记"
                      : "标记为测试"}
                </button>
              </div>
            </div>

            <section className={styles.accountControl} aria-label="账号管理">
              <div>
                <div className={styles.accountStatus}>
                  <span>账号状态</span>
                  <span
                    className={styles.status}
                    data-status={displayUser.status}
                    aria-label={`账号状态：${USER_STATUS_LABELS[displayUser.status]}`}
                  >
                    {USER_STATUS_LABELS[displayUser.status]}
                  </span>
                </div>
                <p>{USER_STATUS_DESCRIPTIONS[displayUser.status]}</p>
              </div>
              {statusAction && (
                <button
                  className={`ui-button ui-button--secondary ${styles.accountAction}`}
                  data-action={statusAction.status}
                  type="button"
                  disabled={!!pending || detailLoading}
                  onClick={() => void updateUserStatus(statusAction.status)}
                >
                  {pending === statusAction.status ? "处理中…" : statusAction.label}
                </button>
              )}
            </section>
            {actionError && (
              <p className="ui-form-message ui-form-message--error" role="alert">
                {actionError}
              </p>
            )}
            {actionMessage && (
              <p className="ui-form-message ui-form-message--success" role="status">
                {actionMessage}
              </p>
            )}

            {/* Summary metrics */}
            <div className={cx(adminStyles, "admin-inline-metrics")}>
              <div>
                <span>学校</span>
                <strong>{displayUser.school?.name ?? "未识别"}</strong>
              </div>
              <div>
                <span>注册时间</span>
                <strong>
                  {new Intl.DateTimeFormat("zh-CN", { dateStyle: "short" }).format(
                    new Date(displayUser.createdAt)
                  )}
                </strong>
              </div>
              <div>
                <span>问卷</span>
                <strong>
                  {displayUser.questionnaireResponse?.submittedAt ? "已提交" : "未提交"}
                </strong>
              </div>
              <div>
                <span>轮次参与</span>
                <strong>
                  {detailLoading || !userDetail ? "…" : userDetail.participationCount}
                </strong>
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
              {[
                { key: "profile" as const, label: "基本资料" },
                {
                  key: "questionnaire" as const,
                  label: `问卷回答${questionnaireAnswerCount != null ? ` (${questionnaireAnswerCount})` : ""}`,
                },
                {
                  key: "cycles" as const,
                  label: `轮次参与 (${userDetail?.participationCount ?? 0})`,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={
                    effectiveDetailTab === tab.key
                      ? "ui-segmented-item active"
                      : "ui-segmented-item"
                  }
                  onClick={() => setDetailTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Profile ─── */}
            <UserProfile model={model} />

            {/* ── Tab: Questionnaire ─── */}
            <UserHistory model={model} />
          </div>
        ) : (
          <div className={cx(adminStyles, "admin-empty-state")}>选择用户后可查看详情。</div>
        )}
    </AdminDetailDialog>
  );
}
