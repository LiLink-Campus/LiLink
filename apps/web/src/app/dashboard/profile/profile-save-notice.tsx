import { profileSavePresentation } from "./save-status";
import type { ContactSaveStatus } from "./contact-editor";
import styles from "./profile-redesign.module.css";

export type ProfileSavePresentation = ReturnType<typeof profileSavePresentation>;
const COMPACT_SAVE_LABELS: Readonly<Record<string, string>> = {
  全部修改已保存: "已保存",
  草稿已自动保存: "草稿已保存",
  "正在重试保存…": "重试中…",
  "正在保存…": "保存中…",
  有修改待保存: "待保存",
  尚未填写: "未填写",
  资料待补全: "待补全",
  联系方式正在自动保存: "联系方式保存中",
  联系方式待补全: "联系方式待完善",
};

export function combinedSavePresentation(
  questionnairePresentation: ProfileSavePresentation,
  contactSaveStatus: ContactSaveStatus
): ProfileSavePresentation {
  return contactSaveStatus === "saved"
    ? questionnairePresentation
    : {
        label:
          contactSaveStatus === "error"
            ? "联系方式保存失败"
            : contactSaveStatus === "invalid"
              ? "联系方式待补全"
              : "联系方式正在自动保存",
        detail:
          contactSaveStatus === "invalid"
            ? "请在关于你中填写选中的联系方式。"
            : contactSaveStatus === "error"
              ? "请在联系方式处重试保存。"
              : "请等待联系方式保存完成。",
        tone: contactSaveStatus === "error" ? "error" : "pending",
      };
}
export function ProfileSaveNotice({
  savePresentation,
  error,
  onRetry,
}: {
  savePresentation: ProfileSavePresentation;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <aside
      className={styles.saveNotice}
      data-tone={savePresentation.tone}
      aria-label="问卷保存状态"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <strong>{savePresentation.label}</strong>
      <span>{savePresentation.detail}</span>
      {error ? (
        <button type="button" onClick={onRetry}>
          重试保存
        </button>
      ) : null}
    </aside>
  );
}
export function ProfileCompactSaveStatus({
  savePresentation,
}: {
  savePresentation: ProfileSavePresentation;
}) {
  const compactSaveLabel = COMPACT_SAVE_LABELS[savePresentation.label] ?? savePresentation.label;
  return (
    <>
      {savePresentation.tone !== "error" ? (
        <span
          className={styles.compactSaveStatus}
          data-tone={savePresentation.tone}
          aria-hidden="true"
          title={`${savePresentation.label}。${savePresentation.detail}`}
        >
          {savePresentation.tone === "saved" ? (
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" fill="currentColor" />
              <path
                d="m5.5 10 3 3 6-6"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
          {compactSaveLabel}
        </span>
      ) : null}
    </>
  );
}
