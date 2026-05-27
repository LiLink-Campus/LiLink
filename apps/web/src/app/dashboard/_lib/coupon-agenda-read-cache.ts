import type { CouponAgendaReadState } from "../../../lib/api";
import type { DashboardPayload } from "./types";

const READ_CACHE_KEY = "lilink:dashboard-coupon-agenda-read-cache";
const REFRESH_REQUEST_KEY = "lilink:dashboard-refresh-needed";
const REFRESH_REASON = "coupon-read";
const READ_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedCouponAgendaRead = {
  state: CouponAgendaReadState;
  cachedAt: number;
  userId: string;
};

type CachedCouponAgendaRefreshRequest = {
  reason: typeof REFRESH_REASON;
  requestedAt: number;
  userId: string;
};

function getSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCachedCouponAgendaRead(userId: string): CachedCouponAgendaRead | null {
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
      typeof cached.userId !== "string" ||
      Date.now() - cached.cachedAt > READ_CACHE_TTL_MS
    ) {
      storage.removeItem(READ_CACHE_KEY);
      return null;
    }

    if (cached.userId !== userId) {
      return null;
    }

    return cached;
  } catch {
    storage.removeItem(READ_CACHE_KEY);
    return null;
  }
}

export function cacheDashboardCouponAgendaRead(
  state: CouponAgendaReadState,
  userId: string | null | undefined,
) {
  const storage = getSessionStorage();
  if (!storage || !state.read || !userId) return;

  try {
    storage.setItem(
      READ_CACHE_KEY,
      JSON.stringify({ state, cachedAt: Date.now(), userId }),
    );
    storage.setItem(
      REFRESH_REQUEST_KEY,
      JSON.stringify({ reason: REFRESH_REASON, requestedAt: Date.now(), userId }),
    );
  } catch {
    // Storage may be unavailable; the server read state remains authoritative.
  }
}

export function consumeDashboardCouponAgendaRefreshRequest(
  userId: string | null | undefined,
) {
  const storage = getSessionStorage();
  if (!storage || !userId) return false;

  try {
    const raw = storage.getItem(REFRESH_REQUEST_KEY);
    if (!raw) return false;

    if (raw === REFRESH_REASON) {
      storage.removeItem(REFRESH_REQUEST_KEY);
      return true;
    }

    const request = JSON.parse(raw) as CachedCouponAgendaRefreshRequest;
    const shouldRefresh =
      request?.reason === REFRESH_REASON &&
      request.userId === userId &&
      typeof request.requestedAt === "number" &&
      Date.now() - request.requestedAt <= READ_CACHE_TTL_MS;
    if (shouldRefresh) {
      storage.removeItem(REFRESH_REQUEST_KEY);
    } else if (
      !request ||
      request.reason !== REFRESH_REASON ||
      typeof request.requestedAt !== "number" ||
      Date.now() - request.requestedAt > READ_CACHE_TTL_MS
    ) {
      storage.removeItem(REFRESH_REQUEST_KEY);
    }
    return shouldRefresh;
  } catch {
    storage.removeItem(REFRESH_REQUEST_KEY);
    return false;
  }
}

export function applyCachedCouponAgendaReadState(
  dashboard: DashboardPayload,
  userId: string | null | undefined,
): DashboardPayload {
  const couponAgenda = dashboard.couponAgenda ?? null;
  if (!couponAgenda || couponAgenda.read || !userId) {
    return dashboard;
  }

  const cached = readCachedCouponAgendaRead(userId);
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
