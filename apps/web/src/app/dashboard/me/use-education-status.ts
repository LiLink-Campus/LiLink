"use client";

import { useCallback, useEffect, useState } from "react";
import type { EducationStatus } from "@lilink/shared";
import { fetchApi } from "@/lib/api";
import { isProfileReadAccount } from "../_lib/profile-read-revision";

type State = { userId: string; status: EducationStatus | null; error: string };

export function useEducationStatus(userId: string) {
  const [state, setState] = useState<State>({ userId, status: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const accept = useCallback((value: EducationStatus) => {
    if (typeof value?.verified !== "boolean" || !(value.schoolName === null || typeof value.schoolName === "string")) {
      throw new Error("认证状态暂时无法读取，请重试。");
    }
    if (isProfileReadAccount(userId)) setState({ userId, status: value, error: "" });
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchApi<EducationStatus>("/me/education", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) accept(value); })
      .catch(() => {
        if (!controller.signal.aborted && isProfileReadAccount(userId)) {
          setState({ userId, status: null, error: "认证状态加载失败，请重试。" });
        }
      });
    return () => controller.abort();
  }, [userId, attempt, accept]);

  const retry = useCallback(() => {
    setState({ userId, status: null, error: "" });
    setAttempt(value => value + 1);
  }, [userId]);

  return {
    status: state.userId === userId ? state.status : null,
    error: state.userId === userId ? state.error : "",
    retry,
    accept,
  };
}
