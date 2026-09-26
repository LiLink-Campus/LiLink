"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi, isApiRequestError } from "../../lib/api";
import { useAdmin } from "./admin-context";

type ReadState<T> = { key: string; data: T | null; loading: boolean; error: string | null };

// Retain only the current query's successful value, scoped to this mounted admin.
export function useAdminRead<T>(path: string, revision = 0) {
  const { authenticated, admin, refreshAuth } = useAdmin();
  const key = authenticated && admin ? `${admin.id}:${path}` : "";
  const [state, setState] = useState<ReadState<T>>({ key: "", data: null, loading: true, error: null });
  const activeKey = useRef(key);
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (activeKey.current !== key) return;
    activeRequest.current?.abort();
    if (!key) {
      setState({ key, data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, loading: true, error: null }));
    try {
      const data = await fetchApi<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted && activeRequest.current === controller) {
        setState({ key, data, loading: false, error: null });
      }
    } catch (error) {
      if (!controller.signal.aborted && activeRequest.current === controller) {
        const unauthorized = isApiRequestError(error) && (error.status === 401 || error.status === 403);
        setState(previous => ({ ...previous, data: unauthorized ? null : previous.data, loading: false, error: error instanceof Error ? error.message : "数据加载失败，请重试。" }));
        if (isApiRequestError(error) && error.status === 401) void refreshAuth();
      }
    }
  }, [key, path, refreshAuth]);
  useEffect(() => {
    activeKey.current = key;
    void refresh();
    return () => {
      activeKey.current = "";
      activeRequest.current?.abort();
    };
  }, [key, refresh, revision]);
  return {
    data: key && state.key === key ? state.data : null,
    loading: Boolean(key) && (state.key !== key || state.loading),
    error: key && state.key === key ? state.error : null,
    refresh,
  };
}
