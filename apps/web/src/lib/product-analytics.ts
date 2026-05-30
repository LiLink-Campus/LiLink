"use client";

import {
  getProductEventDefinition,
  sanitizeProductEventEntityId,
  sanitizeProductEventEntityType,
  sanitizeProductEventMetadata,
  sanitizeProductEventSurface,
  type BrowserProductEventKind,
  type ProductEventMetadata,
  type ProductEventName,
} from "@lilink/shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { getClientApiBaseUrl } from "./api-base-url";

const FOOTPRINT_VISIBLE_RATIO = 0.5;
// Page refs attach to full shells, so default reach is viewport presence.
const PAGE_FOOTPRINT_VISIBLE_RATIO = 0;
const FOOTPRINT_VISIBLE_MS = 900;
const SESSION_STORAGE_KEY = "lilink:analytics-session-id";
const ONCE_STORAGE_PREFIX = "lilink:product-analytics:once:v1";
const fallbackOnceKeys = new Set<string>();

type TrackProductEventOptions = {
  route?: string;
  surface?: string;
  onceKey?: string;
  intentId?: string;
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  flush?: boolean;
};

type FootprintOptions = TrackProductEventOptions & {
  enabled?: boolean;
  threshold?: number;
  durationMs?: number;
};

export function trackFootprint(
  name: ProductEventName,
  options: TrackProductEventOptions = {},
) {
  trackProductEvent(name, "footprint", options);
}

export function trackIntent(
  name: ProductEventName,
  options: TrackProductEventOptions = {},
) {
  trackProductEvent(name, "intent", {
    ...options,
    flush: options.flush ?? true,
  });
}

export function trackMeetupEntryClicked(
  metadata: Record<string, unknown> = {},
) {
  const matchId = sanitizeProductEventEntityId(metadata.matchId);

  trackIntent("meetup_entry_clicked", {
    route: currentRoute() ?? undefined,
    surface: "meetup_entry",
    entityType: matchId ? "match" : undefined,
    entityId: matchId ?? undefined,
    metadata,
  });
}

export function usePageFootprint<T extends Element>(
  name: ProductEventName,
  options: FootprintOptions = {},
): RefCallback<T> {
  return useObservedFootprint<T>(name, options, PAGE_FOOTPRINT_VISIBLE_RATIO);
}

export function useFootprint<T extends Element>(
  name: ProductEventName,
  options: FootprintOptions = {},
): RefCallback<T> {
  return useObservedFootprint<T>(name, options, FOOTPRINT_VISIBLE_RATIO);
}

function useObservedFootprint<T extends Element>(
  name: ProductEventName,
  options: FootprintOptions,
  defaultThreshold: number,
): RefCallback<T> {
  const [node, setNode] = useState<T | null>(null);
  const optionsRef = useRef(options);
  const sentRef = useRef(false);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    sentRef.current = false;
  }, [name, options.onceKey]);

  useEffect(() => {
    if (options.enabled === false || !node || sentRef.current) return;

    const observedNode = node;
    const threshold = normalizeVisibilityThreshold(
      options.threshold,
      defaultThreshold,
    );
    const durationMs = options.durationMs ?? FOOTPRINT_VISIBLE_MS;
    let visibleEnough = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshFallbackVisibility: (() => void) | null = null;

    function hasVisibleViewportExposure() {
      return isElementViewportVisible(observedNode, threshold);
    }

    function clearTimer() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function fireIfStillVisible() {
      timer = null;
      if (
        sentRef.current ||
        !visibleEnough ||
        document.visibilityState !== "visible" ||
        !hasVisibleViewportExposure()
      ) {
        return;
      }
      sentRef.current = true;
      trackFootprint(name, optionsRef.current);
    }

    function scheduleIfReady() {
      if (
        sentRef.current ||
        timer !== null ||
        !visibleEnough ||
        document.visibilityState !== "visible" ||
        !hasVisibleViewportExposure()
      ) {
        return;
      }
      timer = setTimeout(fireIfStillVisible, durationMs);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (refreshFallbackVisibility) {
          refreshFallbackVisibility();
        } else {
          scheduleIfReady();
        }
      } else {
        clearTimer();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const fallbackWindow = window as Window & {
      IntersectionObserver?: typeof IntersectionObserver;
    };
    const IntersectionObserverCtor = fallbackWindow.IntersectionObserver;
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserverCtor === "function") {
      observer = new IntersectionObserverCtor(
        (entries) => {
          const entry = entries[0];
          visibleEnough = Boolean(
            entry?.isIntersecting &&
            entry.intersectionRatio >= threshold &&
            hasVisibleViewportExposure(),
          );
          if (visibleEnough) {
            scheduleIfReady();
          } else {
            clearTimer();
          }
        },
        { threshold: intersectionThresholds(threshold) },
      );
      observer.observe(observedNode);
    } else {
      refreshFallbackVisibility = () => {
        visibleEnough = hasVisibleViewportExposure();
        if (visibleEnough) {
          scheduleIfReady();
        } else {
          clearTimer();
        }
      };
      refreshFallbackVisibility();
      fallbackWindow.addEventListener("scroll", refreshFallbackVisibility, {
        capture: true,
        passive: true,
      });
      fallbackWindow.addEventListener("resize", refreshFallbackVisibility);
      fallbackWindow.addEventListener("pageshow", refreshFallbackVisibility);
    }

    return () => {
      clearTimer();
      observer?.disconnect();
      if (refreshFallbackVisibility) {
        fallbackWindow.removeEventListener(
          "scroll",
          refreshFallbackVisibility,
          {
            capture: true,
          },
        );
        fallbackWindow.removeEventListener("resize", refreshFallbackVisibility);
        fallbackWindow.removeEventListener(
          "pageshow",
          refreshFallbackVisibility,
        );
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    name,
    node,
    defaultThreshold,
    options.enabled,
    options.onceKey,
    options.threshold,
    options.durationMs,
  ]);

  return useCallback((nextNode: T | null) => {
    setNode(nextNode);
  }, []);
}

function normalizeVisibilityThreshold(
  threshold: number | undefined,
  fallback: number,
) {
  const next = threshold ?? fallback;
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(1, next));
}

function intersectionThresholds(threshold: number) {
  return Array.from(new Set([0, threshold, 1]));
}

function isElementViewportVisible(
  element: Element,
  threshold: number,
) {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    document.visibilityState !== "visible"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  if (!isElementCssVisible(element)) return false;

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  if (viewportWidth <= 0 || viewportHeight <= 0) return false;

  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
  );
  const visibleArea = visibleWidth * visibleHeight;
  if (visibleArea <= 0) return false;

  return visibleArea / (rect.width * rect.height) >= threshold;
}

function isElementCssVisible(element: Element) {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;

  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (current.hasAttribute("hidden")) return false;

    const style = view.getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
  }

  return true;
}

function trackProductEvent(
  name: ProductEventName,
  kind: BrowserProductEventKind,
  options: TrackProductEventOptions,
) {
  try {
    const definition = getProductEventDefinition(name);
    if (
      !definition ||
      !definition.browserWritable ||
      definition.kind !== kind
    ) {
      return;
    }

    const entityType = sanitizeProductEventEntityType(name, options.entityType);
    const eventId = randomId();

    const payload = {
      eventId,
      name,
      kind,
      eventVersion: 1,
      sessionId: readSessionId(),
      intentId: cleanString(options.intentId),
      correlationId: cleanString(options.correlationId),
      route: cleanString(options.route) ?? currentRoute(),
      surface: sanitizeProductEventSurface(name, options.surface),
      entityType,
      entityId: entityType
        ? sanitizeProductEventEntityId(options.entityId)
        : null,
      metadata: buildMetadata(name, options.metadata),
      occurredAt: new Date().toISOString(),
    };

    if (!reserveOnceEvent(kind, name, options.onceKey, eventId)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[LiLink analytics] ${kind}:${name}`);
    }

    void fetch(`${getClientApiBaseUrl()}/product-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      keepalive:
        options.flush ??
        (typeof document !== "undefined" &&
          document.visibilityState === "hidden"),
      body: JSON.stringify(payload),
    }).catch(() => {
      // Product analytics must never affect the user-facing flow.
    });
  } catch {
    // Product analytics must never affect the user-facing flow.
  }
}

function reserveOnceEvent(
  kind: BrowserProductEventKind,
  name: ProductEventName,
  onceKey: string | undefined,
  eventId: string,
) {
  const cleanOnceKey = cleanString(onceKey);
  if (!cleanOnceKey) return true;

  const storageKey = `${ONCE_STORAGE_PREFIX}:${kind}:${name}:${encodeURIComponent(cleanOnceKey)}`;
  try {
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ eventId, attemptedAt: new Date().toISOString() }),
    );
    return true;
  } catch {
    if (fallbackOnceKeys.has(storageKey)) return false;
    fallbackOnceKeys.add(storageKey);
    return true;
  }
}

function buildMetadata(
  name: ProductEventName,
  metadata: Record<string, unknown> | undefined,
): ProductEventMetadata | null {
  return sanitizeProductEventMetadata(name, {
    viewportBucket: viewportBucket(),
    ...(metadata ?? {}),
  });
}

function readSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = randomId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function currentRoute() {
  if (typeof window === "undefined") return null;
  return window.location.pathname;
}

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function viewportBucket() {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}
