"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchApi, type AuthMePayload } from "../../lib/api";
import { usePageFootprint } from "../../lib/product-analytics";
import {
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "../../lib/weekly-intent";
import { IntentSheet } from "./_components/IntentSheet";
import { CountdownBanner } from "./_components/CountdownBanner";
import { AgendaList } from "./_components/AgendaList";
import { OliveSprigIllustration } from "./_components/illustrations";
import { useDashboardSessionSeed } from "./_components/DashboardSessionSeed";
import { describeDaysUntilLabel } from "./_lib/focus";
import {
  countActionableAgendaItems,
  resolveAgenda,
  type AgendaItem,
  type AgendaItemAction,
} from "./_lib/agenda";
import {
  applyCachedCouponAgendaReadState,
  consumeDashboardCouponAgendaRefreshRequest,
} from "./_lib/coupon-agenda-read-cache";
import { canEditCurrentCycleParticipation } from "./_lib/format";
import { useClientNow } from "./_lib/use-client-now";
import type {
  ContactPreferencesPayload,
  DashboardPayload,
  QuestionnaireAttentionPayload,
} from "./_lib/types";
import styles from "./home-client.module.css";

const HOME_VISIBLE_REFRESH_TTL_MS = 30_000;

export function HomeClient({
  initialNowMs,
  initialUser,
  initialDashboard,
  questionnairePercent,
  questionnaireConfirmedPercent,
  questionnaireUnconfirmedPercent,
  questionnaireUnconfirmedCount,
  questionnaireSubmitted,
  questionnaireMissingOneLinerIntro,
  questionnaireEligibleToOptIn,
  questionnaireHasIncompleteDraft,
  questionnaireAttention,
  contactPreferences,
}: {
  initialNowMs: number;
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
  questionnairePercent: number;
  questionnaireConfirmedPercent: number;
  questionnaireUnconfirmedPercent: number;
  questionnaireUnconfirmedCount: number;
  questionnaireSubmitted: boolean;
  questionnaireMissingOneLinerIntro: boolean;
  questionnaireEligibleToOptIn: boolean;
  questionnaireHasIncompleteDraft: boolean;
  questionnaireAttention: QuestionnaireAttentionPayload | null;
  contactPreferences: ContactPreferencesPayload;
}) {
  const router = useRouter();
  const lastVisibleRefreshAtRef = useRef(Date.now());
  useDashboardSessionSeed(initialUser);
  const pageFootprintRef = usePageFootprint<HTMLDivElement>(
    "dashboard_page_viewed",
    {
      route: "/dashboard",
      surface: "dashboard_home",
      onceKey: `dashboard_page_viewed:${initialUser.id}`,
    },
  );
  const userId = initialUser.id;
  const [dashboard, setDashboard] = useState<DashboardPayload>(initialDashboard);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const nowMs = useClientNow(initialNowMs);

  useEffect(() => {
    setDashboard(applyCachedCouponAgendaReadState(initialDashboard, userId));
    lastVisibleRefreshAtRef.current = Date.now();
  }, [initialDashboard, userId]);

  useEffect(() => {
    function applyCachedCouponAgendaRead() {
      setDashboard((current) => applyCachedCouponAgendaReadState(current, userId));
    }

    function refreshIfStale(force = false) {
      if (force) {
        applyCachedCouponAgendaRead();
      }

      const now = Date.now();
      if (
        !force &&
        now - lastVisibleRefreshAtRef.current < HOME_VISIBLE_REFRESH_TTL_MS
      ) {
        return;
      }
      lastVisibleRefreshAtRef.current = now;
      router.refresh();
    }

    refreshIfStale(consumeDashboardCouponAgendaRefreshRequest(userId));

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshIfStale(consumeDashboardCouponAgendaRefreshRequest(userId));
      }
    }
    function handleFocus() {
      refreshIfStale(consumeDashboardCouponAgendaRefreshRequest(userId));
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [router, userId]);

  const cycle = dashboard.currentCycle;
  const canEdit = canEditCurrentCycleParticipation(cycle, nowMs);
  const isOptedIn = cycle?.participationStatus === "OPTED_IN";
  const intent = cycle?.intent ?? null;

  const latestMatch = dashboard.latestMatch;
  const counterpart =
    latestMatch && initialUser
      ? latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null
      : null;
  const counterpartDisplayName = counterpart?.displayName ?? null;

  const agenda = useMemo(
    () =>
      resolveAgenda({
        dashboard,
        nowMs,
        contactPreferences,
        counterpartDisplayName,
        questionnaire: {
          percent: questionnairePercent,
          confirmedPercent: questionnaireConfirmedPercent,
          unconfirmedPercent: questionnaireUnconfirmedPercent,
          unconfirmedCount: questionnaireUnconfirmedCount,
          submitted: questionnaireSubmitted,
          missingOneLinerIntro: questionnaireMissingOneLinerIntro,
          eligibleToOptIn: questionnaireEligibleToOptIn,
          attention: questionnaireAttention,
        },
      }),
    [
      dashboard,
      nowMs,
      contactPreferences,
      counterpartDisplayName,
      questionnairePercent,
      questionnaireConfirmedPercent,
      questionnaireUnconfirmedPercent,
      questionnaireUnconfirmedCount,
      questionnaireSubmitted,
      questionnaireMissingOneLinerIntro,
      questionnaireEligibleToOptIn,
      questionnaireAttention,
    ],
  );

  function setSavedMessageOnly(message: string | null) {
    setSavedMessage(message);
    setError(null);
  }

  function setErrorOnly(message: string | null) {
    setError(message);
    setSavedMessage(null);
  }

  function openIntentSheetFromTask() {
    if (!cycle) {
      setErrorOnly("当前没有开放中的轮次。");
      return;
    }
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态或本周意向。");
      return;
    }
    if (!isOptedIn && !questionnaireEligibleToOptIn) {
      setErrorOnly(
        questionnaireMissingOneLinerIntro
          ? "请先在「我的」完善一句话介绍，再参加本轮匹配。"
          : questionnaireHasIncompleteDraft
            ? "匹配资料有未保存的修改且必填项缺失，请补完后再参加本轮匹配。"
            : "请先完成「匹配资料」，再参加本轮匹配。",
      );
      return;
    }
    setSheetOpen(true);
  }

  async function chooseIntent(nextIntent: WeeklyIntent) {
    if (!cycle) {
      setErrorOnly("当前没有开放中的轮次。");
      setSheetOpen(false);
      return;
    }
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态或本周意向。");
      setSheetOpen(false);
      return;
    }

    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: true, intent: nextIntent }),
      });
      setDashboard((current) =>
        current.currentCycle
          ? {
              ...current,
              currentCycle: {
                ...current.currentCycle,
                participationStatus: "OPTED_IN",
                intent: nextIntent,
              },
            }
          : current,
      );
      setSavedMessageOnly(
        `本周意向已锁定为 ${WEEKLY_INTENT_LABELS[nextIntent].primary}（${WEEKLY_INTENT_LABELS[nextIntent].subtitle}）。`,
      );
      setSheetOpen(false);
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error
          ? caughtError.message
          : "本周意向保存失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!cycle) return;
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态。");
      return;
    }

    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: false }),
      });
      setDashboard((current) =>
        current.currentCycle
          ? {
              ...current,
              currentCycle: {
                ...current.currentCycle,
                participationStatus: "OPTED_OUT",
                intent: null,
              },
            }
          : current,
      );
      setSavedMessageOnly("已退出本轮，意向已清空；随时可以重新加入。");
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error ? caughtError.message : "退出本轮失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleAgendaAction(
    _itemId: AgendaItem["id"],
    action: AgendaItemAction,
  ) {
    if (action.kind === "intent-sheet") {
      openIntentSheetFromTask();
    } else if (action.kind === "withdraw") {
      void withdraw();
    }
  }

  const pendingCount = countActionableAgendaItems(agenda);

  const cycleEyebrow = cycle
    ? ["本轮", cycle.codename, describeDaysUntilLabel(cycle.revealAt, nowMs)]
        .filter(Boolean)
        .join(" · ")
    : "本周";

  return (
    <div
      ref={pageFootprintRef}
      className={`${styles.pageShell} ${styles.v2PageShell} ${styles.homeDashboard}`}
    >
      <header className={styles.greeting}>
        <div className={styles.greetingMain}>
          <span className={styles.greetingEyebrow}>{cycleEyebrow}</span>
          <h1>
            你好，{initialUser?.displayName ?? "同学"}
            <OliveSprigIllustration className={styles.oliveSprig} />
          </h1>
          <p className={styles.greetingSub}>
            {pendingCount > 0
              ? `这一周，下面 ${pendingCount} 件事最值得你花几分钟。`
              : "新的一周，期待你的相遇。"}
          </p>
        </div>
      </header>

      {savedMessage ? <p className="ui-form-message ui-form-message--success">{savedMessage}</p> : null}
      {error ? <p className="ui-form-message ui-form-message--error">{error}</p> : null}

      <CountdownBanner countdown={agenda.countdown} />
      <AgendaList
        items={agenda.items}
        pendingCount={pendingCount}
        savingAction={saving}
        onAction={handleAgendaAction}
      />

      <IntentSheet
        open={sheetOpen}
        saving={saving}
        currentIntent={intent}
        onChoose={(nextIntent) => void chooseIntent(nextIntent)}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
