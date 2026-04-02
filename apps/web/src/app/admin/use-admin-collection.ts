"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";
import { useAdmin } from "./admin-context";
import type { PaginatedResult } from "./types";

type QueryValue = string | number | undefined;

export function useAdminCollection<T>(
  path: string,
  params: Record<string, QueryValue>,
) {
  const { authenticated } = useAdmin();
  const [data, setData] = useState<PaginatedResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") {
        return;
      }

      searchParams.set(key, String(value));
    });

    const serialized = searchParams.toString();
    return serialized ? `${path}?${serialized}` : path;
  }, [params, path]);

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextData = await fetchApi<PaginatedResult<T>>(queryString);
      setData(nextData);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "后台列表加载失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticated, queryString]);

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
