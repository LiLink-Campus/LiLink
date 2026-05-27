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

function hasDocumentVisibility() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
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

function entryIsVisible(entry: IntersectionObserverEntry) {
  if (!entry.isIntersecting || typeof window === "undefined") return false;

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const requiredHeight =
    Math.min(entry.boundingClientRect.height, viewportHeight) * MIN_VISIBLE_RATIO;
  const requiredWidth =
    Math.min(entry.boundingClientRect.width, viewportWidth) * MIN_VISIBLE_RATIO;

  return (
    entry.intersectionRect.height >= requiredHeight &&
    entry.intersectionRect.width >= requiredWidth
  );
}

export function useCouponReadVisibility<T extends HTMLElement>({
  enabled,
  delayMs = DEFAULT_DELAY_MS,
  onMarkedRead,
}: UseCouponReadVisibilityOptions) {
  const elementRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    if (
      triggeredRef.current ||
      inFlightRef.current ||
      !enabled ||
      !element ||
      !hasDocumentVisibility() ||
      !elementIsVisible(element)
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
  }, [clearTimer]);

  const scheduleRead = useCallback(() => {
    if (
      triggeredRef.current ||
      inFlightRef.current ||
      !enabled ||
      !hasDocumentVisibility() ||
      timerRef.current !== null
    ) {
      return;
    }

    timerRef.current = setTimeout(markRead, delayMs);
  }, [delayMs, enabled, markRead]);

  const evaluateCurrentVisibility = useCallback(() => {
    const element = elementRef.current;
    if (!element || !enabled || triggeredRef.current || inFlightRef.current) {
      cancelRead();
      return;
    }

    if (hasDocumentVisibility() && elementIsVisible(element)) {
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
      if (!hasDocumentVisibility()) {
        cancelRead();
        return;
      }
      evaluateCurrentVisibility();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (typeof IntersectionObserver === "undefined") {
      evaluateCurrentVisibility();
      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        cancelRead();
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry || triggeredRef.current || inFlightRef.current || !enabled) {
          cancelRead();
          return;
        }

        if (hasDocumentVisibility() && entryIsVisible(entry)) {
          scheduleRead();
        } else {
          cancelRead();
        }
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] },
    );

    observer.observe(element);
    evaluateCurrentVisibility();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
