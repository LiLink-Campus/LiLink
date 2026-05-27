"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  markCouponAgendaRead,
  type CouponAgendaReadState,
} from "../../../lib/api";

type UseCouponReadVisibilityOptions = {
  enabled: boolean;
  delayMs?: number;
  onMarkedRead?: (state: CouponAgendaReadState) => void;
};

const DEFAULT_DELAY_MS = 2_000;
const MIN_VISIBLE_RATIO = 0.6;

function debugCouponRead(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[LiLink coupons] ${message}`);
  }
}

function canAccrueReadTime() {
  if (typeof document === "undefined") return true;
  if (document.visibilityState === "hidden") return false;
  return typeof document.hasFocus !== "function" || document.hasFocus();
}

function elementIsVisible(element: HTMLElement) {
  if (typeof window === "undefined") return false;

  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
  );
  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
  );
  const requiredHeight = Math.min(rect.height, viewportHeight) * MIN_VISIBLE_RATIO;
  const requiredWidth = Math.min(rect.width, viewportWidth) * MIN_VISIBLE_RATIO;

  return (
    rect.height > 0 &&
    rect.width > 0 &&
    visibleHeight >= requiredHeight &&
    visibleWidth >= requiredWidth
  );
}

export function useCouponReadVisibility<T extends HTMLElement>({
  enabled,
  delayMs = DEFAULT_DELAY_MS,
  onMarkedRead,
}: UseCouponReadVisibilityOptions) {
  const elementRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSinceRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);
  const inFlightRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const markRead = useCallback(() => {
    const element = elementRef.current;
    clearTimer();

    const visibleSince = visibleSinceRef.current;
    if (
      triggeredRef.current ||
      inFlightRef.current ||
      !enabled ||
      !element ||
      !canAccrueReadTime() ||
      !elementIsVisible(element) ||
      visibleSince === null
    ) {
      return;
    }

    inFlightRef.current = true;
    markCouponAgendaRead()
      .then((state) => {
        triggeredRef.current = true;
        onMarkedRead?.(state);
        debugCouponRead("read-state marked");
      })
      .catch(() => {
        debugCouponRead("read-state mark failed");
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [clearTimer, enabled, onMarkedRead]);

  const cancelRead = useCallback(() => {
    clearTimer();
    visibleSinceRef.current = null;
  }, [clearTimer]);

  const scheduleRead = useCallback(() => {
    if (
      triggeredRef.current ||
      inFlightRef.current ||
      !enabled ||
      !canAccrueReadTime() ||
      timerRef.current !== null
    ) {
      return;
    }

    visibleSinceRef.current ??= Date.now();
    timerRef.current = setTimeout(markRead, delayMs);
  }, [delayMs, enabled, markRead]);

  const evaluateCurrentVisibility = useCallback(() => {
    const element = elementRef.current;
    if (!element || !enabled || triggeredRef.current || inFlightRef.current) {
      cancelRead();
      return;
    }

    if (canAccrueReadTime() && elementIsVisible(element)) {
      scheduleRead();
    } else {
      cancelRead();
    }
  }, [cancelRead, enabled, scheduleRead]);

  const ref = useCallback((node: T | null) => {
    elementRef.current = node;
  }, []);

  useEffect(() => {
    if (!enabled || triggeredRef.current) {
      cancelRead();
      return;
    }

    const element = elementRef.current;
    if (!element) return;

    function handleVisibilityChange() {
      evaluateCurrentVisibility();
    }

    function handleBlur() {
      cancelRead();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("scroll", evaluateCurrentVisibility, true);
    window.addEventListener("resize", evaluateCurrentVisibility);
    window.addEventListener("focus", evaluateCurrentVisibility);
    window.addEventListener("blur", handleBlur);

    if (typeof IntersectionObserver === "undefined") {
      evaluateCurrentVisibility();
      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        document.removeEventListener("scroll", evaluateCurrentVisibility, true);
        window.removeEventListener("resize", evaluateCurrentVisibility);
        window.removeEventListener("focus", evaluateCurrentVisibility);
        window.removeEventListener("blur", handleBlur);
        cancelRead();
      };
    }

    const observer = new IntersectionObserver(
      () => {
        evaluateCurrentVisibility();
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );

    observer.observe(element);
    evaluateCurrentVisibility();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("scroll", evaluateCurrentVisibility, true);
      window.removeEventListener("resize", evaluateCurrentVisibility);
      window.removeEventListener("focus", evaluateCurrentVisibility);
      window.removeEventListener("blur", handleBlur);
      cancelRead();
    };
  }, [
    cancelRead,
    enabled,
    evaluateCurrentVisibility,
    scheduleRead,
  ]);

  return ref;
}
