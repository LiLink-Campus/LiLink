"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { chinaStandardDatetimeLocalValueFromIso, chinaStandardDatetimeToIso } from "@/lib/china-standard-time";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminCycle, AdminCycleDetail, AdminCyclePreview, CycleMatchDetail, PaginatedResult } from "../types";
import { ADMIN_NEW_CYCLE_SELECTION, createEmptyCycleForm, isExistingCycleSelection, buildAdminQueryString, type InitialCyclesRead } from "./cycle-model";

export function useCycles(initialRead?: InitialCyclesRead) {
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(initialRead?.data?.items[0]?.id ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(AdminCycle & { participationCount: number }) | null>(null);
  const [resultTab, setResultTab] = useState<"preview" | "final">("final");
  const previewRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setCyclePreview(null);
    setCycleDetail(null);
    setMatchesData(null);
    setPending((current) => (current === "preview" ? null : current));
    setResultTab("final");
    setActionError(null);
    setActionMessage(null);
    return () => previewRequest.current?.abort();
  }, [selectedCycleId]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminCycle["status"]>("ALL");
  const [page, setPage] = useState(1);
  const [cycleDataRefreshKey, setCycleDataRefreshKey] = useState(0);
  const [cycleForm, setCycleForm] = useState(createEmptyCycleForm);
  const [cycleDetail, setCycleDetail] = useState<AdminCycleDetail | null>(null);
  const [matchesData, setMatchesData] = useState<PaginatedResult<CycleMatchDetail> | null>(null);
  const [cyclePreview, setCyclePreview] = useState<AdminCyclePreview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [matchPage, setMatchPage] = useState(1);
  const [pairPage, setPairPage] = useState(1);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AdminCycle>("/admin/cycles", {
    page,
    pageSize: 10,
    search: submittedSearch.trim(),
    status: statusFilter === "ALL" ? undefined : statusFilter,
  }, initialRead);
  const cycles = useMemo(() => data?.items ?? [], [data]);
  const PAGE_SIZE_MATCHES = 6;

  useEffect(() => {
    if (selectedCycleId === ADMIN_NEW_CYCLE_SELECTION) return;
    if (!cycles.length) {
      setSelectedCycleId(null);
      return;
    }

    if (!selectedCycleId || !cycles.some((cycle) => cycle.id === selectedCycleId)) {
      setSelectedCycleId(cycles[0].id);
    }
  }, [cycles, selectedCycleId]);

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;
  const isSystemLockedCycleStatus =
    cycleForm.status === "PREPARING" ||
    cycleForm.status === "REVEAL_READY" ||
    cycleForm.status === "REVEALED";

  useEffect(() => {
    if (!selectedCycle) {
      setCycleForm(createEmptyCycleForm());
      setCycleDetail(null);
      setMatchesData(null);
      setCyclePreview(null);
      return;
    }

    setCycleForm({
      cycleId: selectedCycle.id,
      codename: selectedCycle.codename,
      participationDeadline: chinaStandardDatetimeLocalValueFromIso(
        selectedCycle.participationDeadline
      ),
      revealAt: chinaStandardDatetimeLocalValueFromIso(selectedCycle.revealAt),
      status: selectedCycle.status,
      notes: selectedCycle.notes ?? "",
    });
    setMatchPage(1);
    setPairPage(1);
    setExpandedMatchId(null);
  }, [selectedCycle]);

  useEffect(() => {
    setExpandedMatchId(null);
  }, [matchPage, selectedCycleId]);

  async function loadCycleSummary(cycleId: string) {
    const detail = await fetchApi<AdminCycleDetail>(`/admin/cycles/${cycleId}`);
    setCycleDetail(detail);
    return detail;
  }

  function refreshSelectedCycleDataViews() {
    setCycleDataRefreshKey((currentValue) => currentValue + 1);
  }

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setCycleDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    fetchApi<AdminCycleDetail>(`/admin/cycles/${selectedCycleId}`)
      .then((detail) => {
        if (!active) return;
        setCycleDetail(detail);
        setCyclePreview(null);
      })
      .catch((caughtError) => {
        if (!active) return;
        setActionError(caughtError instanceof Error ? caughtError.message : "轮次详情加载失败。");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCycleId]);

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setMatchesData(null);
      return;
    }

    let active = true;
    setMatchesLoading(true);

    fetchApi<PaginatedResult<CycleMatchDetail>>(
      `/admin/cycles/${selectedCycleId}/matches${buildAdminQueryString({
        page: matchPage,
        pageSize: PAGE_SIZE_MATCHES,
      })}`
    )
      .then((result) => {
        if (active) {
          setMatchesData(result);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setActionError(
            caughtError instanceof Error ? caughtError.message : "轮次匹配结果加载失败。"
          );
        }
      })
      .finally(() => {
        if (active) {
          setMatchesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cycleDataRefreshKey, matchPage, selectedCycleId]);

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (cycleForm.status === "PREPARING") {
      setActionError("PREPARING 是系统内部状态，不能通过后台表单手动保存。");
      return;
    }

    if (cycleForm.status === "REVEALED" && selectedCycle?.status !== "REVEALED") {
      setActionError("REVEALED 必须通过执行轮次来设置，不能通过后台表单手动保存。");
      return;
    }

    if (cycleForm.status === "REVEAL_READY" && selectedCycle?.status !== "REVEAL_READY") {
      setActionError("REVEAL_READY 必须通过预生成流程设置，不能通过后台表单手动保存。");
      return;
    }

    const participationDeadline = chinaStandardDatetimeToIso(cycleForm.participationDeadline);
    const revealAt = chinaStandardDatetimeToIso(cycleForm.revealAt);
    if (!participationDeadline || !revealAt) {
      setActionError("请填写有效的北京时间（参与截止与揭晓时间）。");
      return;
    }

    setPending("save");

    try {
      const saved = await fetchApi<AdminCycle>("/admin/cycles", {
        method: "PUT",
        body: JSON.stringify({
          ...cycleForm,
          participationDeadline,
          revealAt,
          cycleId: cycleForm.cycleId || undefined,
        }),
      });
      setActionMessage(cycleForm.cycleId ? "轮次已更新。" : "轮次已创建。");
      setEditorOpen(false);
      setCyclePreview(null);
      await refresh();
      setSelectedCycleId(saved.id);
      if (saved.id === selectedCycleId) await loadCycleSummary(saved.id);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次保存失败。");
    } finally {
      setPending(null);
    }
  }

  async function runCycle(force: boolean) {
    if (!isExistingCycleSelection(selectedCycleId)) return;

    const confirmed = window.confirm(
      force
        ? "强制执行会跳过揭晓时间检查；若本周期已有匹配记录，将先全部删除再重新生成。此操作不可撤销。确认继续吗？"
        : "执行轮次会开始生成正式匹配结果。确认继续吗？"
    );
    if (!confirmed) return;

    setPending(force ? "force-run" : "run");
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await fetchApi<{
        ok: boolean;
        message?: string;
        createdMatches?: number;
      }>("/admin/cycles/run", {
        method: "POST",
        body: JSON.stringify({ cycleId: selectedCycleId, force }),
      });
      setActionMessage(
        result.message ??
          (typeof result.createdMatches === "number"
            ? `轮次已执行，生成 ${result.createdMatches} 组匹配。`
            : "轮次执行完成。")
      );
      await refresh();
      if (selectedCycleId) {
        await loadCycleSummary(selectedCycleId);
        refreshSelectedCycleDataViews();
        setResultTab("final");
      }
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次执行失败。");
    } finally {
      setPending(null);
    }
  }

  async function duplicateCycle() {
    if (!isExistingCycleSelection(selectedCycleId)) return;
    setPending("duplicate");
    setActionError(null);
    setActionMessage(null);

    try {
      const duplicate = await fetchApi<AdminCycle>(`/admin/cycles/${selectedCycleId}/duplicate`, {
        method: "POST",
      });
      setActionMessage(`已复制轮次 ${duplicate.codename}，状态为 DRAFT。`);
      setPage(1);
      await refresh();
      setSelectedCycleId(duplicate.id);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次复制失败。");
    } finally {
      setPending(null);
    }
  }

  async function deleteCycle() {
    if (!deleteTarget) return;
    setPending("delete");
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/cycles/${deleteTarget.id}`, {
        method: "DELETE", body: JSON.stringify({ expectedParticipationCount: deleteTarget.participationCount }),
      });
      setDeleteTarget(null);
      setSelectedCycleId(null);
      setPage(1);
      await refresh();
      setActionMessage(`已删除草稿轮次“${deleteTarget.codename}”。`);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "删除轮次失败。");
    } finally { setPending(null); }
  }

  async function previewCycle() {
    if (!isExistingCycleSelection(selectedCycleId)) return;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setResultTab("preview");
    setPending("preview");
    setActionError(null);
    setActionMessage(null);

    try {
      const preview = await fetchApi<AdminCyclePreview>(
        `/admin/cycles/${selectedCycleId}/preview`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setPairPage(1);
      setCyclePreview(preview);
      setActionMessage(preview.message ?? "预演结果已生成。");
    } catch (caughtError) {
      if (controller.signal.aborted) return;
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次预演失败。");
    } finally {
      if (previewRequest.current === controller) setPending(null);
    }
  }

  function exportCycleDetail() {
    if (!cycleDetail) return;
    const blob = new Blob([JSON.stringify(cycleDetail, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${cycleDetail.cycle.codename}-detail.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  return {
    selectedCycleId, setSelectedCycleId, editorOpen, setEditorOpen, deleteTarget, setDeleteTarget, resultTab, setResultTab, statusFilter, setStatusFilter, setPage, cycleDataRefreshKey, cycleForm, setCycleForm, cycleDetail, matchesData, cyclePreview, detailLoading, matchesLoading, pending, actionError, setActionError, actionMessage, setActionMessage, pairPage, setPairPage, expandedMatchId, setExpandedMatchId, draftSearch, setDraftSearch, data, loading, error, refresh, cycles, selectedCycle, isSystemLockedCycleStatus, saveCycle, runCycle, duplicateCycle, deleteCycle, previewCycle, exportCycleDetail, handleSearchSubmit, refreshSelectedCycleDataViews, setMatchPage, PAGE_SIZE_PAIRS: 6
  };
}

export type CyclesController = ReturnType<typeof useCycles>;
