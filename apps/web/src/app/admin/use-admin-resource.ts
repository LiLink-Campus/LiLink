"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import { useAdmin } from "./admin-context";

export function useAdminResource<T>(path: string) {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextData = await fetchApi<T>(path);
      setData(nextData);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "后台数据加载失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticated, path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
