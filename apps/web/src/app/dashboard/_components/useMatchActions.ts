"use client";

import { useEffect, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import {
  applyContactSuccessToDashboard,
  applyReportSuccessToDashboard,
} from "../_lib/dashboard-mutations";
import { DEFAULT_REPORT_REASON } from "../_lib/format";
import type { DashboardPayload } from "../_lib/types";
import { useLocale } from "../../locale-context";

type SavingKey = null | "contact" | "report";

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
  const { locale } = useLocale();
  const copy =
    locale === "zh-CN"
      ? {
          contactSent: "已向双方发送引荐邮件。",
          contactRefreshFailed:
            "引荐已提交，但页面刷新失败。请稍后手动刷新查看最新状态。",
          contactFailed: "引荐发送失败。",
          reportSent: "举报已提交，系统已将该对象从你后续轮次里隔离。",
          reportRefreshFailed:
            "举报已提交，但页面刷新失败。请稍后手动刷新查看最新状态。",
          reportFailed: "举报提交失败。",
        }
      : {
          contactSent: "Introduction emails have been sent to both sides.",
          contactRefreshFailed:
            "Introduction was submitted, but the page could not refresh. Refresh later to see the latest status.",
          contactFailed: "Could not send the introduction.",
          reportSent:
            "Report submitted. This person has been isolated from your future rounds.",
          reportRefreshFailed:
            "Report was submitted, but the page could not refresh. Refresh later to see the latest status.",
          reportFailed: "Could not submit the report.",
        };
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

  const reportSectionRef = useRef<HTMLElement | null>(null);
  const reportReasonSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!reportOpen || !reportTargetMatchId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      reportSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      reportReasonSelectRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [reportOpen, reportTargetMatchId]);

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

  async function requestContact(matchId: string) {
    setSaving("contact");
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi(`/me/matches/${matchId}/contact`, { method: "POST" });
      setDashboard((current) =>
        applyContactSuccessToDashboard(current, matchId, currentUserId),
      );
      setSavedMessage(copy.contactSent);
      await refreshDashboardAfterMutation(copy.contactRefreshFailed);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : copy.contactFailed,
      );
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
      setSavedMessage(copy.reportSent);
      await refreshDashboardAfterMutation(copy.reportRefreshFailed);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : copy.reportFailed,
      );
    } finally {
      setSaving(null);
    }
  }

  // Returned shape is intentionally flat (no nested `report` object).
  // Wrapping refs together with non-ref callbacks confuses the
  // react-hooks/refs lint rule into flagging every property access on
  // the wrapper as "ref access during render", because the wrapper now
  // looks ref-like to static analysis.
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
    reportSectionRef,
    reportReasonSelectRef,
    setReportReason,
    setReportDetails,
    openReportForm,
    closeReportForm,
    toggleReportForm,
    reportFormIsOpenForMatch,
  };
}
