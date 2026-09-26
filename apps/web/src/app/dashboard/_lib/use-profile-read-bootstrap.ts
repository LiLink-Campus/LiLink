"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchApi, isApiRequestError } from "@/lib/api";
import { isProfileReadAccount, profileReadRevision, hasOtherProfileWrites, subscribeProfileWrites } from "./profile-read-revision";

const paths = { home: "/dashboard", profile: "/dashboard/profile", center: "/dashboard/me" };

export function useProfileReadBootstrap<T extends { user: { id: string } }>(page: keyof typeof paths, initialData: T) {
  const pathname = usePathname();
  const router = useRouter();
  const userId = initialData.user.id;
  const [owner] = useState(() => Symbol("profile-bootstrap"));
  const [writeEvent, setWriteEvent] = useState(0);
  const verifiedRevision = useRef(0);
  const source = useRef({ userId, initialData });
  const [data, setData] = useState<T | null>(() => profileReadRevision(userId) || (page === "profile" && hasOtherProfileWrites(userId, owner)) ? null : initialData);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => subscribeProfileWrites(event => {
    if (page === "profile" && event.owner === owner) return;
    setWriteEvent(value => value + 1);
  }), [page, owner]);

  useLayoutEffect(() => {
    if (pathname !== paths[page]) return;
    if (source.current.userId !== userId) verifiedRevision.current = 0;
    const sourceChanged = source.current.initialData !== initialData || source.current.userId !== userId;
    source.current = { userId, initialData };
    if (page === "profile" && hasOtherProfileWrites(userId, owner)) {
      setData(null);
      setError(null);
      const timer = window.setTimeout(() => setError("上次保存仍在处理中，请稍后重试。"), 15_000);
      return () => window.clearTimeout(timer);
    }
    if (profileReadRevision(userId) <= verifiedRevision.current) {
      if (sourceChanged) {
        setData(initialData);
        setError(null);
      }
      return;
    }
    const controller = new AbortController();
    setData(null);
    setError(null);
    void (async () => {
      try {
        // A concurrent completed write must not be consumed by an older read.
        for (let pass = 0; pass < 3; pass += 1) {
          const capturedRevision = profileReadRevision(userId);
          const next = await fetchApi<T>(`/me/page-bootstrap/${page}`, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (!isProfileReadAccount(userId) || next.user.id !== userId) {
            router.replace("/login");
            return;
          }
          if (profileReadRevision(userId) !== capturedRevision) continue;
          verifiedRevision.current = capturedRevision;
          setData(next);
          return;
        }
        setError("资料刚刚更新，请重试获取最新内容。");
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (isApiRequestError(caught) && caught.status === 401) {
          router.replace("/login");
          return;
        }
        setError(caught instanceof Error ? caught.message : "最新资料暂时无法加载，请重试。");
      }
    })();
    return () => controller.abort();
    // An editor ignores its own events; late writes from an older editor revalidate.
  }, [pathname, page, userId, initialData, attempt, router, writeEvent, owner]);

  return { data, error, owner, retry: () => setAttempt(value => value + 1) };
}
