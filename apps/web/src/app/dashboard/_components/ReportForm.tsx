"use client";

import { forwardRef, type Ref } from "react";
import {
  REPORT_REASON_OPTIONS,
  REPORT_FORM_SECTION_ID,
  buildDashboardFieldId,
} from "../_lib/format";
import { useLocale } from "../../locale-context";

type ReportFormProps = {
  reason: string;
  details: string;
  saving: boolean;
  onReasonChange: (next: string) => void;
  onDetailsChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  reasonSelectRef?: Ref<HTMLSelectElement>;
};

/**
 * Inline report form rendered directly under a match. Shared between the
 * /dashboard/match page (latest match) and /dashboard/history page (one
 * card per past round).
 */
export const ReportForm = forwardRef<HTMLElement, ReportFormProps>(
  function ReportForm(
    {
      reason,
      details,
      saving,
      onReasonChange,
      onDetailsChange,
      onSubmit,
      onCancel,
      reasonSelectRef,
    },
    ref,
  ) {
    const { locale } = useLocale();
    const copy =
      locale === "zh-CN"
        ? {
            title: "提交举报",
            status: "举报匹配",
            intro:
              "请确认你要举报的是当前选中的这条匹配记录；提交后系统将按规则处理并可能限制相关展示。",
            reason: "举报原因",
            details: "补充说明（可选）",
            submitting: "提交中…",
            submit: "确认举报",
            cancel: "取消",
          }
        : {
            title: "Submit report",
            status: "Report match",
            intro:
              "Confirm that you are reporting the selected match. After submission, LiLink will handle it according to safety rules and may limit related display.",
            reason: "Reason",
            details: "Additional details (optional)",
            submitting: "Submitting...",
            submit: "Submit report",
            cancel: "Cancel",
          };

    return (
      <section
        ref={ref}
        className="app-card"
        id={REPORT_FORM_SECTION_ID}
      >
        <div className="app-card-head">
          <h2>{copy.title}</h2>
          <span className="app-card-status is-warn">{copy.status}</span>
        </div>
        <p className="app-card-muted">{copy.intro}</p>
        <div className="report-form">
          <label>
            <span>{copy.reason}</span>
            <select
              ref={reasonSelectRef}
              id={buildDashboardFieldId("report-reason")}
              name="reportReason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            >
              {REPORT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[locale]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{copy.details}</span>
            <textarea
              id={buildDashboardFieldId("report-details")}
              name="reportDetails"
              rows={3}
              value={details}
              onChange={(e) => onDetailsChange(e.target.value)}
            />
          </label>
          <div className="auth-actions">
            <button
              className="button-primary"
              disabled={saving}
              type="button"
              onClick={onSubmit}
            >
              {saving ? copy.submitting : copy.submit}
            </button>
            <button
              className="button-secondary"
              disabled={saving}
              type="button"
              onClick={onCancel}
            >
              {copy.cancel}
            </button>
          </div>
        </div>
      </section>
    );
  },
);
