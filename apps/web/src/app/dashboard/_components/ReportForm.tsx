"use client";

import { forwardRef, type Ref } from "react";
import {
  REPORT_FORM_SECTION_ID,
  buildDashboardFieldId,
} from "../_lib/format";

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
    return (
      <section
        ref={ref}
        className="content-panel dashboard-panel-wide"
        id={REPORT_FORM_SECTION_ID}
      >
        <p className="eyebrow">举报匹配</p>
        <h2>提交举报</h2>
        <p className="dashboard-muted">
          请确认你要举报的是当前选中的这条匹配记录；提交后系统将按规则处理并可能限制相关展示。
        </p>
        <div className="report-form">
          <label>
            <span>举报原因</span>
            <select
              ref={reasonSelectRef}
              id={buildDashboardFieldId("report-reason")}
              name="reportReason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            >
              <option value="骚扰">骚扰</option>
              <option value="冒犯内容">冒犯内容</option>
              <option value="身份异常">身份异常</option>
              <option value="恶意行为">恶意行为</option>
              <option value="其他">其他</option>
            </select>
          </label>
          <label>
            <span>补充说明（可选）</span>
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
              {saving ? "提交中…" : "确认举报"}
            </button>
            <button
              className="button-secondary"
              disabled={saving}
              type="button"
              onClick={onCancel}
            >
              取消
            </button>
          </div>
        </div>
      </section>
    );
  },
);
