"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isApiRequestError, fetchCouponOverview, fetchCouponPage, type CouponGroup, type CouponOverview, type CouponStatusResponse, type MyCoupon } from "@/lib/api";

export function useCouponsData(initial: CouponOverview | null, initialError: string | null, onAuthorizationLost: () => void) {
  const [data, setData] = useState(initial);
  const [authenticationRequired, setAuthenticationRequired] = useState(false);
  const [loading, setLoading] = useState(!initial && !initialError);
  const [error, setError] = useState(initialError);
  const [loadingMore, setLoadingMore] = useState({ available: false, history: false });
  const refreshRequest = useRef<AbortController | null>(null);
  const pageRequests = useRef<Partial<Record<CouponGroup, AbortController>>>({});

  const handleFailure = useCallback((caught: unknown, fallback: string) => {
    if (isApiRequestError(caught) && (caught.status === 401 || caught.status === 403)) {
      refreshRequest.current?.abort();
      refreshRequest.current = null;
      Object.values(pageRequests.current).forEach(request => request.abort());
      pageRequests.current = {};
      setData(null);
      setLoading(false);
      setLoadingMore({ available: false, history: false });
      setAuthenticationRequired(true);
      setError("登录状态已失效，请重新登录。");
      onAuthorizationLost();
      return;
    }
    setError(caught instanceof Error ? caught.message : fallback);
  }, [onAuthorizationLost]);

  const refresh = useCallback(async () => {
    if (refreshRequest.current) return;
    Object.values(pageRequests.current).forEach(request => request.abort());
    pageRequests.current = {};
    setLoadingMore({ available: false, history: false });
    const controller = new AbortController();
    refreshRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCouponOverview(controller.signal);
      if (!controller.signal.aborted) setData(result);
    } catch (caught) {
      if (!controller.signal.aborted) handleFailure(caught, "优惠券加载失败，请重试。");
    } finally {
      if (refreshRequest.current === controller) refreshRequest.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [handleFailure]);

  const loadMore = useCallback(async (group: CouponGroup) => {
    const cursor = data?.[group].nextCursor;
    if (!cursor || pageRequests.current[group] || refreshRequest.current) return;
    const controller = new AbortController();
    pageRequests.current[group] = controller;
    setLoadingMore(current => ({ ...current, [group]: true }));
    setError(null);
    try {
      const result = await fetchCouponPage(group, cursor, controller.signal);
      if (!controller.signal.aborted) setData(current => {
        if (!current || current[group].nextCursor !== cursor) return current;
        const items = [...new Map([...current[group].items, ...result.items].map(item => [item.id, item])).values()];
        return { ...current, [group]: { items, nextCursor: result.nextCursor } };
      });
    } catch (caught) {
      if (!controller.signal.aborted) handleFailure(caught, "更多优惠券加载失败，请重试。");
    } finally {
      if (pageRequests.current[group] === controller) delete pageRequests.current[group];
      if (!controller.signal.aborted) setLoadingMore(current => ({ ...current, [group]: false }));
    }
  }, [data, handleFailure]);

  const updateStatus = useCallback((coupon: MyCoupon, status: CouponStatusResponse) => {
    if (status.status === "ISSUED") return;
    refreshRequest.current?.abort();
    refreshRequest.current = null;
    Object.values(pageRequests.current).forEach(request => request.abort());
    pageRequests.current = {};
    setLoading(false);
    setLoadingMore({ available: false, history: false });
    // A successful status read is authoritative; move the card immediately.
    setData(current => current ? {
      available: { ...current.available, items: current.available.items.filter(item => item.id !== coupon.id) },
      history: { ...current.history, items: [{ ...coupon, status: status.status, redeemedAt: status.redeemedAt ?? coupon.redeemedAt }, ...current.history.items.filter(item => item.id !== coupon.id)] },
    } : current);
  }, []);

  useEffect(() => {
    if (!initial && !initialError) void refresh();
    return () => {
      refreshRequest.current?.abort();
      refreshRequest.current = null;
      Object.values(pageRequests.current).forEach(request => request.abort());
      pageRequests.current = {};
    };
  }, [initial, initialError, refresh]);

  return { data, authenticationRequired, loading, loadingMore, error, refresh, loadMore, updateStatus };
}
