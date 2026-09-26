"use client";

import { useMemo } from "react";
import { useAdminRead } from "./use-admin-read";
import type { PaginatedResult } from "./types";

type QueryValue = string | number | undefined;

export function useAdminCollection<T>(path: string, params: Record<string, QueryValue>) {
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

  return useAdminRead<PaginatedResult<T>>(queryString);
}
