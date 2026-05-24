"use client";

import { dcx } from "../_lib/dashboard-class-names";
import { useEffect, useId, useRef } from "react";
import { buildDashboardFieldId } from "../_lib/format";

type FeedbackFormProps = {
  open: boolean;
  rating: number;
  comment: string;
  saving: boolean;
  onRatingChange: (next: number) => void;
  onCommentChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const RATING_VALUES = [1, 2, 3, 4, 5];

/**
 * Inline feedback dialog shared between /dashboard/match and history rows.
 * Feedback is fully optional; if submitted, a 1-5 rating is required and the
 * comment is optional. Visible only to the platform — never to the other party.
 */
export function FeedbackForm({
  open,
  rating,
  comment,
  saving,
  onRatingChange,
  onCommentChange,
  onSubmit,
  onCancel,
}: FeedbackFormProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocusRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (saving) return;
    if (event.target === dialogRef.current) {
      onCancel();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={dcx("v2-report-dialog")}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      onClose={() => {
        if (open && !saving) onCancel();
      }}
      onClick={handleBackdropClick}
    >
      <div
        className={dcx("v2-report-dialog-inner")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={dcx("v2-report-dialog-head")}>
          <span className={dcx("v2-report-dialog-eyebrow")}>反馈</span>
          <h2 id={titleId}>评价本次匹配</h2>
          <p id={descriptionId}>
            你的评分与文字反馈仅供平台改进匹配，对方不会看到。评分必填，文字可选。
          </p>
        </header>
        <div className={dcx("v2-report-dialog-body")}>
          <div
            className={dcx("v2-report-dialog-field")}
            role="radiogroup"
            aria-label="本次匹配评分"
          >
            <span>本次匹配评分</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {RATING_VALUES.map((value) => {
                const active = value <= rating;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={value === rating}
                    aria-label={`${value} 星`}
                    disabled={saving}
                    onClick={() => onRatingChange(value)}
                    style={{
                      flex: 1,
                      padding: "0.5rem 0",
                      borderRadius: "0.6rem",
                      border: active
                        ? "1px solid #df6b7c"
                        : "1px solid #e3d7da",
                      background: active ? "#fdeef0" : "#fff",
                      color: active ? "#b93e5b" : "#bbb",
                      fontSize: "1.25rem",
                      lineHeight: 1,
                      cursor: saving ? "default" : "pointer",
                    }}
                  >
                    {active ? "★" : "☆"}
                  </button>
                );
              })}
            </div>
          </div>
          <label className={dcx("v2-report-dialog-field")}>
            <span>文字评价（可选）</span>
            <textarea
              id={buildDashboardFieldId("feedback-comment")}
              name="feedbackComment"
              rows={4}
              maxLength={1000}
              value={comment}
              disabled={saving}
              placeholder="聊得来吗？是否符合预期？这些反馈帮助我们优化后续匹配。"
              onChange={(e) => onCommentChange(e.target.value)}
            />
          </label>
        </div>
        <footer className={dcx("v2-report-dialog-foot")}>
          <button
            className={dcx("ui-button ui-button--secondary")}
            disabled={saving}
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={dcx("ui-button ui-button--primary")}
            disabled={saving || rating < 1}
            type="button"
            onClick={onSubmit}
          >
            {saving ? "提交中…" : "保存评价"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
