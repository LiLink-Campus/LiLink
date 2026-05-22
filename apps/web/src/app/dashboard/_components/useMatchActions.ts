"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import {
  applyContactSuccessToDashboard,
  applyFeedbackSuccessToDashboard,
  applyReportSuccessToDashboard,
} from "../_lib/dashboard-mutations";
import { DEFAULT_REPORT_REASON } from "../_lib/format";
import type { DashboardPayload, MatchFeedback } from "../_lib/types";

type SavingKey = null | "contact" | "report" | "feedback";

type UseMatchActionsOptions = {
  initialDashboard: DashboardPayload | null;
  currentUserId: string | null;
};

/**
 * Shared mutation surface for `/dashboard/match` and `/dashboard/history`:
 * holds the dashboard snapshot, the optimistic mutation handlers for
 * "request contact" / "submit report", and the inline report form state.
 */
export function useMatchActions({
  initialDashboard,
  currentUserId,
}: UseMatchActionsOptions) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(
    initialDashboard,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<SavingKey>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportTargetMatchId, setReportTargetMatchId] = useState<string | null>(
    null,
  );
  const [reportReason, setReportReason] = useState(DEFAULT_REPORT_REASON);
  const [reportDetails, setReportDetails] = useState("");

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTargetMatchId, setFeedbackTargetMatchId] = useState<
    string | null
  >(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");

  // Keep local dashboard state aligned with the latest server snapshot when
  // the RSC tree revalidates (e.g. router.refresh), matching the hub page.
  useEffect(() => {
    setDashboard(initialDashboard);
  }, [initialDashboard]);

  function closeReportForm() {
    setReportOpen(false);
    setReportTargetMatchId(null);
    setReportReason(DEFAULT_REPORT_REASON);
    setReportDetails("");
  }

  function openReportForm(matchId: string) {
    setReportTargetMatchId(matchId);
    setReportReason(DEFAULT_REPORT_REASON);
    setReportDetails("");
    setReportOpen(true);
  }

  function toggleReportForm(matchId: string) {
    if (reportOpen && reportTargetMatchId === matchId) {
      closeReportForm();
      return;
    }
    openReportForm(matchId);
  }

  function reportFormIsOpenForMatch(matchId: string) {
    return reportOpen && reportTargetMatchId === matchId;
  }

  async function refreshDashboard() {
    const next = await fetchApi<DashboardPayload>("/me/dashboard");
    setDashboard(next);
  }

  async function refreshDashboardAfterMutation(failureMessage: string) {
    try {
      await refreshDashboard();
    } catch {
      setError(failureMessage);
    }
  }

  async function requestContact(matchId: string): Promise<boolean> {
    setSaving("contact");
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi(`/me/matches/${matchId}/contact`, { method: "POST" });
      setDashboard((current) =>
        applyContactSuccessToDashboard(current, matchId, currentUserId),
      );
      setSavedMessage("已向双方发送引荐邮件。");
      await refreshDashboardAfterMutation(
        "引荐已提交，但页面刷新失败。请稍后手动刷新查看最新状态。",
      );
      return true;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "引荐发送失败。",
      );
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function submitReport() {
    const matchId = reportTargetMatchId;
    if (!matchId) return;
    setSaving("report");
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi(`/me/matches/${matchId}/report`, {
        method: "POST",
        body: JSON.stringify({
          reason: reportReason,
          ...(reportDetails.trim()
            ? { details: reportDetails.trim() }
            : {}),
        }),
      });
      setDashboard((current) => applyReportSuccessToDashboard(current, matchId));
      closeReportForm();
      setSavedMessage("举报已提交，系统已将该对象从你后续轮次里隔离。");
      await refreshDashboardAfterMutation(
        "举报已提交，但页面刷新失败。请稍后手动刷新查看最新状态。",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "举报提交失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  function closeFeedbackForm() {
    setFeedbackOpen(false);
    setFeedbackTargetMatchId(null);
    setFeedbackRating(0);
    setFeedbackComment("");
  }

  function openFeedbackForm(
    matchId: string,
    existing?: { rating: number; comment: string | null } | null,
  ) {
    setFeedbackTargetMatchId(matchId);
    setFeedbackRating(existing?.rating ?? 0);
    setFeedbackComment(existing?.comment ?? "");
    setFeedbackOpen(true);
  }

  function toggleFeedbackForm(
    matchId: string,
    existing?: { rating: number; comment: string | null } | null,
  ) {
    if (feedbackOpen && feedbackTargetMatchId === matchId) {
      closeFeedbackForm();
      return;
    }
    openFeedbackForm(matchId, existing);
  }

  function feedbackFormIsOpenForMatch(matchId: string) {
    return feedbackOpen && feedbackTargetMatchId === matchId;
  }

  async function submitFeedback() {
    const matchId = feedbackTargetMatchId;
    if (!matchId) return;
    if (feedbackRating < 1 || feedbackRating > 5) {
      setError("请先选择 1-5 星评分。");
      return;
    }
    setSaving("feedback");
    setSavedMessage(null);
    setError(null);
    try {
      const comment = feedbackComment.trim();
      const saved = await fetchApi<MatchFeedback>(
        `/me/matches/${matchId}/feedback`,
        {
          method: "PUT",
          body: JSON.stringify({
            rating: feedbackRating,
            ...(comment ? { comment } : {}),
          }),
        },
      );
      setDashboard((current) =>
        applyFeedbackSuccessToDashboard(current, matchId, saved),
      );
      closeFeedbackForm();
      setSavedMessage("已保存你对本次匹配的反馈评价。");
      await refreshDashboardAfterMutation(
        "反馈已保存，但页面刷新失败。请稍后手动刷新查看最新状态。",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "反馈提交失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  return {
    dashboard,
    error,
    savedMessage,
    saving,
    requestContact,
    submitReport,
    refreshDashboard,
    reportOpen,
    reportTargetMatchId,
    reportReason,
    reportDetails,
    setReportReason,
    setReportDetails,
    openReportForm,
    closeReportForm,
    toggleReportForm,
    reportFormIsOpenForMatch,
    feedbackOpen,
    feedbackTargetMatchId,
    feedbackRating,
    feedbackComment,
    setFeedbackRating,
    setFeedbackComment,
    openFeedbackForm,
    closeFeedbackForm,
    toggleFeedbackForm,
    feedbackFormIsOpenForMatch,
    submitFeedback,
  };
}
