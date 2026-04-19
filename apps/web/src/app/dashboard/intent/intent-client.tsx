"use client";

import { useState } from "react";
import { fetchApi } from "../../../lib/api";
import {
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "../../../lib/weekly-intent";
import { SubPageNav } from "../_components/SubPageNav";
import { WeeklyIntentCard } from "../_components/WeeklyIntentCard";
import type { DashboardPayload } from "../_lib/types";

export function IntentClient({
  initialDashboard,
}: {
  initialDashboard: DashboardPayload;
}) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(
    initialDashboard,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pick a weekly intent → server enforces "opt-in requires intent" so this
  // single call covers both the participation toggle and the intent choice.
  async function chooseWeeklyIntent(nextIntent: WeeklyIntent) {
    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: true, intent: nextIntent }),
      });
      setDashboard((current) =>
        current?.currentCycle
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
      setSavedMessage(
        `本周匹配已锁定为 ${WEEKLY_INTENT_LABELS[nextIntent].primary}（${WEEKLY_INTENT_LABELS[nextIntent].subtitle}）。`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "本周意图保存失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdrawWeeklyIntent() {
    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: false }),
      });
      setDashboard((current) =>
        current?.currentCycle
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
      setSavedMessage("你已退出本轮，意图已清空；随时可以重新选择。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "退出本轮失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  const nextRevealLabel = dashboard?.currentCycle
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }).format(new Date(dashboard.currentCycle.revealAt))
    : null;

  return (
    <main className="page-shell dashboard-page">
      <SubPageNav />

      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">本周意图</p>
        <h1>本周匹配意图</h1>
        <p className="dashboard-lede">
          每周重新选择一次。BOTH 与所有意图相容；FRIEND 与 DATE 互斥。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="content-panel dashboard-panel-wide">
        <WeeklyIntentCard
          dashboard={dashboard}
          nextRevealLabel={nextRevealLabel}
          saving={saving}
          onChoose={(nextIntent) => void chooseWeeklyIntent(nextIntent)}
          onWithdraw={() => void withdrawWeeklyIntent()}
        />
      </section>
    </main>
  );
}
