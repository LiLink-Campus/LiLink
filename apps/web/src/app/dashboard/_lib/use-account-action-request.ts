"use client";

import { useCallback, useEffect, useRef } from "react";
import { fetchApi } from "@/lib/api";
import { withReadDeadline } from "@/lib/read-deadline";

export function isAccountActionCancelled(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

// Account dialogs never retry writes automatically; a lost response is reconciled.
export function useAccountActionRequest() {
  const mounted = useRef(true);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  const request = useCallback(async <T>(path: string, init?: RequestInit): Promise<T> => {
    const controller = new AbortController();
    active.current = controller;
    try {
      // The signal remains attached through fetchApi's response.text().
      const result = await withReadDeadline(controller.signal, signal => fetchApi<T>(path, { ...init, signal }));
      controller.signal.throwIfAborted();
      return result;
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, []);

  const isMounted = useCallback(() => mounted.current, []);
  return { request, isMounted };
}
