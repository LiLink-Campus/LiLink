"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEligibleSchools, type EligibleSchoolsPayload } from "../../lib/eligible-schools";

export function useRegistrationSchools() {
  const [payload, setPayload] = useState<EligibleSchoolsPayload | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError(null);
    try {
      const nextPayload = await fetchEligibleSchools({
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setPayload(nextPayload);
    } catch {
      if (!controller.signal.aborted) {
        setError("学校列表加载失败，请稍后重试。");
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const resume = () => { if (!document.hidden) void reload(); };
    const interval = window.setInterval(resume, 30000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      activeRequest.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reload]);

  return { payload, pending, error, reload };
}
