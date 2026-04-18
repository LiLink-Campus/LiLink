"use client";

import { useEffect, useSyncExternalStore } from "react";
import { apiBaseUrl } from "../lib/api-base-url";
import type { LandingPayload } from "../lib/landing-payload";
import { HeroRevealCountdown } from "./hero-reveal-countdown";

const HOMEPAGE_REGISTERED_COUNT_PAD = 50;
const HOMEPAGE_COMPLETED_COUNT_PAD = 40;
const HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET = 10;
const LANDING_REFRESH_INTERVAL_MS = 60_000;

type LandingSnapshot =
  | { status: "idle" | "loading"; payload: null; fetchedAt: null }
  | { status: "ready"; payload: LandingPayload; fetchedAt: number }
  | { status: "error"; payload: null; fetchedAt: null };

let landingSnapshot: LandingSnapshot = {
  status: "idle",
  payload: null,
  fetchedAt: null,
};
let inflightRequest: Promise<void> | null = null;

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return landingSnapshot;
}

function hasFreshLandingPayload() {
  return (
    landingSnapshot.status === "ready" &&
    Date.now() - landingSnapshot.fetchedAt < LANDING_REFRESH_INTERVAL_MS
  );
}

async function fetchLandingPayload() {
  const response = await fetch(`${apiBaseUrl}/public/landing`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Landing payload request failed with ${response.status}.`);
  }

  return response.json() as Promise<LandingPayload>;
}

function ensureLandingPayload(force = false) {
  if ((!force && hasFreshLandingPayload()) || inflightRequest) {
    return;
  }

  const previousPayload =
    landingSnapshot.status === "ready" ? landingSnapshot.payload : null;
  const previousFetchedAt =
    landingSnapshot.status === "ready" ? landingSnapshot.fetchedAt : null;

  if (!previousPayload) {
    landingSnapshot = {
      status: "loading",
      payload: null,
      fetchedAt: null,
    };
    emitChange();
  }

  inflightRequest = fetchLandingPayload()
    .then((payload) => {
      landingSnapshot = {
        status: "ready",
        payload,
        fetchedAt: Date.now(),
      };
    })
    .catch(() => {
      if (!previousPayload) {
        landingSnapshot = {
          status: "error",
          payload: null,
          fetchedAt: null,
        };
        return;
      }

      landingSnapshot = {
        status: "ready",
        payload: previousPayload,
        fetchedAt: previousFetchedAt ?? Date.now(),
      };
    })
    .finally(() => {
      inflightRequest = null;
      emitChange();
    });
}

function useLandingSnapshot() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    ensureLandingPayload();

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        ensureLandingPayload();
      }
    }

    function refreshOnFocus() {
      ensureLandingPayload();
    }

    const intervalId = window.setInterval(() => {
      ensureLandingPayload();
    }, LANDING_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return snapshot;
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "轮次时间待配置";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function LandingRevealMeta() {
  const snapshot = useLandingSnapshot();
  const landing = snapshot.status === "ready" ? snapshot.payload : null;

  return (
    <div className="hero-meta">
      <span>{landing ? "下次揭晓" : "状态提醒"}</span>
      {snapshot.status === "loading" || snapshot.status === "idle" ? (
        <div className="hero-reveal-countdown hero-reveal-countdown--static">
          正在获取轮次时间
        </div>
      ) : (
        <HeroRevealCountdown
          offline={snapshot.status === "error"}
          revealAt={landing?.currentCycle?.revealAt ?? null}
          serverFallbackLabel={
            snapshot.status === "error"
              ? "平台数据暂时不可用"
              : formatDateLabel(landing?.currentCycle?.revealAt ?? null)
          }
        />
      )}
    </div>
  );
}

export function LandingHeroCard() {
  const snapshot = useLandingSnapshot();
  const landing = snapshot.status === "ready" ? snapshot.payload : null;

  return (
    <div className="hero-card">
      <small>LiLink weekly reveal</small>
      <strong>{landing?.tagline ?? "正在同步平台数据。"}</strong>
      <p>
        {snapshot.status === "ready"
          ? "园区限定、学校白名单、每周一个轮次。把相遇从高频刷屏，拉回到节制与期待。"
          : snapshot.status === "error"
            ? "请稍后重试。如果这是部署环境，请检查前端 API 地址、后端服务和跨域配置。"
            : "首屏内容先渲染，轮次和统计数据会在页面加载后补齐。"}
      </p>
    </div>
  );
}

export function LandingStatsStrip() {
  const snapshot = useLandingSnapshot();
  const landing = snapshot.status === "ready" ? snapshot.payload : null;
  const matchesDelivered = landing?.stats.matchesDelivered ?? 0;
  const matchesLabelIsNarrative = landing != null && matchesDelivered <= 0;

  return (
    <section className="stats-strip">
      <div>
        <span>注册用户</span>
        <strong>
          {landing
            ? `${landing.stats.registeredUsers + HOMEPAGE_REGISTERED_COUNT_PAD}+`
            : "—"}
        </strong>
      </div>
      <div>
        <span>已完成问卷</span>
        <strong>
          {landing
            ? landing.stats.completedQuestionnaires +
              HOMEPAGE_COMPLETED_COUNT_PAD
            : "—"}
        </strong>
      </div>
      <div>
        <span>已送出匹配</span>
        <strong
          className={matchesLabelIsNarrative ? "stats-strip-note" : undefined}
        >
          {landing == null
            ? "—"
            : matchesLabelIsNarrative
              ? "正在准备进行首轮匹配"
              : matchesDelivered + HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET}
        </strong>
      </div>
    </section>
  );
}
