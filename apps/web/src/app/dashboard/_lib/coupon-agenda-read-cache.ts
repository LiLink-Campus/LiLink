import type { CouponAgendaReadState } from "../../../lib/api";
import type { DashboardPayload } from "./types";

const READ_CACHE_KEY = "lilink:dashboard-coupon-agenda-read-cache";
const REFRESH_REQUEST_KEY = "lilink:dashboard-refresh-needed";
const REFRESH_REASON = "coupon-read";
const READ_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedCouponAgendaRead = {
  state: CouponAgendaReadState;
  cachedAt: number;
};

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCachedCouponAgendaRead(): CachedCouponAgendaRead | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(READ_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedCouponAgendaRead;
    if (
      !cached ||
      !cached.state ||
      cached.state.read !== true ||
      typeof cached.cachedAt !== "number" ||
      Date.now() - cached.cachedAt > READ_CACHE_TTL_MS
    ) {
      storage.removeItem(READ_CACHE_KEY);
      return null;
    }

    return cached;
  } catch {
    storage.removeItem(READ_CACHE_KEY);
    return null;
  }
}

export function cacheDashboardCouponAgendaRead(state: CouponAgendaReadState) {
  const storage = getSessionStorage();
  if (!storage || !state.read) return;

  try {
    storage.setItem(
      READ_CACHE_KEY,
      JSON.stringify({ state, cachedAt: Date.now() }),
    );
    storage.setItem(REFRESH_REQUEST_KEY, REFRESH_REASON);
  } catch {
    // Storage may be unavailable; the server read state remains authoritative.
  }
}

export function consumeDashboardCouponAgendaRefreshRequest() {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    const shouldRefresh = storage.getItem(REFRESH_REQUEST_KEY) === REFRESH_REASON;
    if (shouldRefresh) {
      storage.removeItem(REFRESH_REQUEST_KEY);
    }
    return shouldRefresh;
  } catch {
    return false;
  }
}

export function applyCachedCouponAgendaReadState(
  dashboard: DashboardPayload,
): DashboardPayload {
  const couponAgenda = dashboard.couponAgenda ?? null;
  if (!couponAgenda || couponAgenda.read) {
    return dashboard;
  }

  const cached = readCachedCouponAgendaRead();
  if (
    !cached ||
    cached.state.target !== couponAgenda.target ||
    cached.state.version !== couponAgenda.version
  ) {
    return dashboard;
  }

  return {
    ...dashboard,
    couponAgenda: {
      ...couponAgenda,
      read: true,
      readAt: cached.state.readAt ?? couponAgenda.readAt,
      unreadAvailableCount: 0,
    },
  };
}
