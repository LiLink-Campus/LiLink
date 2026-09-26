"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi, isApiRequestError } from "@/lib/api";
import type { VipStatus } from "../vip/vip-client";

function withCurrentExpiry(value: VipStatus | null) {
  return value?.active && value.expiresAt && Date.parse(value.expiresAt) <= Date.now()
    ? { ...value, active: false }
    : value;
}

export function useVipStatus(initialVip: VipStatus | null) {
  const [vip, setVip] = useState(() => withCurrentExpiry(initialVip));
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (document.hidden || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const next = await fetchApi<VipStatus>("/me/vip", { signal: controller.signal });
      if (!controller.signal.aborted) {
        setVip(withCurrentExpiry(next));
        setError(null);
      }
    } catch (caught) {
      if (!controller.signal.aborted) {
        if (isApiRequestError(caught) && caught.status === 401) {
          setVip(null);
          setError(null);
        } else {
          setError("权益状态暂时无法更新，稍后会自动重试。");
        }
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, []);

  useEffect(() => {
    const resume = () => {
      if (document.hidden) {
        activeRequest.current?.abort();
        activeRequest.current = null;
      } else void refresh();
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = window.setInterval(resume, 30_000);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);

  useEffect(() => {
    if (!vip?.active || !vip.expiresAt) return;
    const expiresAt = Date.parse(vip.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    let timer: number;
    const expire = () => {
      const remaining = expiresAt - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(expire, Math.min(2_147_483_647, remaining));
      } else {
        setVip(current => withCurrentExpiry(current));
        void refresh();
      }
    };
    expire();
    return () => window.clearTimeout(timer);
  }, [vip?.active, vip?.expiresAt, refresh]);

  return { vip, error };
}
