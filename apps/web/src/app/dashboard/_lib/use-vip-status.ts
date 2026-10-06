"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchApi, isApiRequestError } from "@/lib/api";
import type { VipStatus } from "@lilink/shared";
import { isProfileReadAccount, subscribeProfileReadAccount } from "./profile-read-revision";

function withCurrentExpiry(value: VipStatus | null) {
  return value?.active && value.expiresAt && Date.parse(value.expiresAt) <= Date.now()
    ? { ...value, active: false } : value;
}

export function useVipStatus(userId: string, initialVip: VipStatus | null, bootstrap: object) {
  const [vip, setVip] = useState(initialVip);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
  }, []);

  // Invalidate old reads before a successor bootstrap is painted, including null → null.
  useLayoutEffect(() => {
    invalidate();
    setVip(withCurrentExpiry(initialVip));
    setError(null);
    return invalidate;
  }, [userId, initialVip, bootstrap, invalidate]);

  // The session seed's effect runs first; all data and timers remain instance-local.
  useEffect(() => {
    let scope = generation.current;
    let disposed = false;
    let currentVip = withCurrentExpiry(initialVip);
    let polling: number | undefined;
    let expiryTimer: number | undefined;
    let lastWakeAt = -Infinity;
    const current = () => !disposed && scope === generation.current;
    const available = () => current() && isProfileReadAccount(userId);

    function scheduleExpiry() {
      window.clearTimeout(expiryTimer);
      if (document.hidden || !currentVip?.active || !currentVip.expiresAt) return;
      const remaining = Date.parse(currentVip.expiresAt) - Date.now();
      if (!Number.isFinite(remaining)) return;
      expiryTimer = window.setTimeout(() => {
        if (!available()) return;
        currentVip = withCurrentExpiry(currentVip);
        setVip(currentVip);
        if (currentVip?.active) scheduleExpiry();
        else void refresh();
      }, Math.min(2_147_483_647, Math.max(0, remaining)));
    }

    async function refresh() {
      if (!available() || document.hidden || activeRequest.current) return;
      const controller = new AbortController();
      const requestScope = scope;
      activeRequest.current = controller;
      try {
        const next = await fetchApi<VipStatus>("/me/vip", { signal: controller.signal });
        if (!controller.signal.aborted && available() && requestScope === scope) {
          currentVip = withCurrentExpiry(next);
          setVip(currentVip);
          setError(null);
          scheduleExpiry();
        }
      } catch (caught) {
        if (!controller.signal.aborted && available() && requestScope === scope) {
          if (isApiRequestError(caught) && caught.status === 401) {
            currentVip = null;
            setVip(null);
            setError(null);
            window.clearTimeout(expiryTimer);
          } else setError("权益状态暂时无法更新，稍后会自动重试。");
        }
      } finally {
        if (activeRequest.current === controller) activeRequest.current = null;
      }
    }

    function pause() {
      window.clearInterval(polling);
      polling = undefined;
      window.clearTimeout(expiryTimer);
      activeRequest.current?.abort();
      activeRequest.current = null;
      lastWakeAt = -Infinity;
    }
    function startPolling() {
      if (polling === undefined) polling = window.setInterval(() => void refresh(), 30_000);
      scheduleExpiry();
    }
    function wake() {
      if (!available()) return;
      if (document.hidden) { pause(); return; }
      // Companion visibility/focus events also coalesce after a fast response.
      if (Date.now() - lastWakeAt < 500) return;
      lastWakeAt = Date.now();
      currentVip = withCurrentExpiry(currentVip);
      setVip(currentVip);
      startPolling();
      void refresh();
    }
    const unsubscribe = subscribeProfileReadAccount(() => {
      if (!current()) return;
      pause();
      scope = ++generation.current;
      currentVip = null;
      setVip(null);
      setError(null);
      if (isProfileReadAccount(userId)) wake();
    });
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    if (!document.hidden && available()) {
      startPolling();
      if (!initialVip || (initialVip.active && !currentVip?.active)) wake();
    }
    return () => {
      disposed = true;
      pause();
      unsubscribe();
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [userId, initialVip, bootstrap]);

  return { vip, error };
}
