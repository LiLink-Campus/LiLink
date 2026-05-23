"use client";

import { useEffect, useId, useRef } from "react";
import {
  REPORT_FORM_SECTION_ID,
  buildDashboardFieldId,
} from "../_lib/format";

type ReportFormProps = {
  open: boolean;
  reason: string;
  details: string;
  saving: boolean;
  onReasonChange: (next: string) => void;
  onDetailsChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

const REPORT_REASON_OPTIONS = [
  "骚扰",
  "冒犯内容",
  "身份异常",
  "恶意行为",
  "其他",
];

/**
 * Modal report dialog shared between /dashboard/match (current match) and
 * /dashboard/history (past rounds). Uses the native <dialog> element so we
 * get ESC, focus trapping, and backdrop layering for free. The host page is
 * expected to always mount this component and toggle `open`, which keeps
 * the dialog stable across pages and avoids focus loss.
 */
export function ReportForm({
  open,
  reason,
  details,
  saving,
  onReasonChange,
  onDetailsChange,
  onSubmit,
  onCancel,
}: ReportFormProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const reasonSelectRef = useRef<HTMLSelectElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      // Defer focus to the next frame so the dialog has laid out — focusing
      // a still-hidden <select> is a no-op in some browsers.
      window.requestAnimationFrame(() => {
        reasonSelectRef.current?.focus({ preventScroll: true });
      });
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
      className="v2-report-dialog"
      id={REPORT_FORM_SECTION_ID}
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
        className="v2-report-dialog-inner"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="v2-report-dialog-head">
          <span className="v2-report-dialog-eyebrow">举报</span>
          <h2 id={titleId}>提交举报</h2>
          <p id={descriptionId}>
            请确认你要举报的是当前选中的这条匹配记录；提交后系统将按规则处理并可能限制相关展示。
          </p>
        </header>
        <div className="v2-report-dialog-body">
          <label className="v2-report-dialog-field">
            <span>举报原因</span>
            <select
              ref={reasonSelectRef}
              id={buildDashboardFieldId("report-reason")}
              name="reportReason"
              value={reason}
              disabled={saving}
              onChange={(e) => onReasonChange(e.target.value)}
            >
              {REPORT_REASON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-report-dialog-field">
            <span>补充说明（可选）</span>
            <textarea
              id={buildDashboardFieldId("report-details")}
              name="reportDetails"
              rows={4}
              maxLength={500}
              value={details}
              disabled={saving}
              placeholder="可补充时间、地点、对话片段等线索；与原因配合更利于审核。"
              onChange={(e) => onDetailsChange(e.target.value)}
            />
          </label>
        </div>
        <footer className="v2-report-dialog-foot">
          <button
            className="ui-button ui-button--secondary"
            disabled={saving}
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="ui-button ui-button--danger"
            disabled={saving}
            type="button"
            onClick={onSubmit}
          >
            {saving ? "提交中…" : "确认举报"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
