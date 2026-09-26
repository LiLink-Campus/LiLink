"use client";

import { useEffect, useState } from "react";
import { fetchMatchEstimate, type MatchEstimate, type MatchEstimatePayload } from "@/lib/api";

export function useMatchEstimate(payload: MatchEstimatePayload, enabled: boolean) {
  const key = JSON.stringify(payload);
  const [state, setState] = useState<{ key: string; data: MatchEstimate | null; pending: boolean }>({ key: "", data: null, pending: false });
  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null;
    let timer: number | undefined;
    const schedule = () => {
      if (document.hidden || controller || timer != null) return;
      timer = window.setTimeout(async () => {
        timer = undefined;
        const request = new AbortController();
        controller = request;
        setState(current => ({ key, data: current.key === key ? current.data : null, pending: true }));
        try {
          const result = await fetchMatchEstimate(JSON.parse(key) as MatchEstimatePayload, request.signal);
          if (!request.signal.aborted) setState({ key, data: result.available ? result : null, pending: false });
        } catch {
          if (!request.signal.aborted) setState({ key, data: null, pending: false });
        } finally {
          if (controller === request) controller = null;
        }
      }, 400);
    };
    const pause = () => {
      window.clearTimeout(timer);
      timer = undefined;
      controller?.abort();
      controller = null;
    };
    const resume = () => {
      if (document.hidden) pause();
      else schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      pause();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [key, enabled]);
  return { matchEstimate: enabled && state.key === key ? state.data : null, matchEstimatePending: enabled && (state.key !== key || state.pending) };
}
