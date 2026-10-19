import type { AdminCycle, PaginatedResult } from "../types";
import type { AdminReadSeed } from "../use-admin-read";

export type InitialCyclesRead = AdminReadSeed<PaginatedResult<AdminCycle>>;


export const STATUS_STYLES: Record<AdminCycle["status"], { bg: string; color: string }> = {
  OPEN: { bg: "var(--sage-soft)", color: "var(--sage)" },
  PREPARING: { bg: "rgba(191, 219, 254, 0.35)", color: "#1d4ed8" },
  DRAFT: { bg: "var(--color-gold-soft)", color: "#8a6d2b" },
  REVEAL_READY: {
    bg: "var(--color-accent-soft)",
    color: "var(--color-accent-ink)",
  },
  REVEALED: { bg: "var(--color-coral-soft)", color: "var(--color-coral)" },
};

export const CYCLE_STATUS_LABELS: Record<"ALL" | AdminCycle["status"], string> = {
  ALL: "全部",
  DRAFT: "草稿",
  OPEN: "开放报名",
  PREPARING: "预生成中",
  REVEAL_READY: "待揭晓",
  REVEALED: "已揭晓",
};
export const EDITABLE_CYCLE_STATUSES = ["DRAFT", "OPEN"] as const;

/** Sentinel: list selection while creating a cycle (must not match a real id). */
export const ADMIN_NEW_CYCLE_SELECTION = "__admin_new_cycle__";

export function createEmptyCycleForm() {
  return {
    cycleId: "",
    codename: "",
    participationDeadline: "",
    revealAt: "",
    status: "DRAFT" as AdminCycle["status"],
    notes: "",
  };
}

export function isExistingCycleSelection(id: string | null): id is string {
  return Boolean(id) && id !== ADMIN_NEW_CYCLE_SELECTION;
}

export function buildAdminQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}
