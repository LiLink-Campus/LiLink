"use client";

import { type CSSProperties } from "react";
import {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  WEEKLY_INTENT_VISUALS,
  type WeeklyIntent,
} from "../../../lib/weekly-intent";
import { formatCycleDeadline } from "../_lib/format";
import type { DashboardPayload } from "../_lib/types";

type WeeklyIntentCardProps = {
  dashboard: DashboardPayload | null;
  nextRevealLabel: string | null;
  saving: boolean;
  onChoose: (intent: WeeklyIntent) => void;
  onWithdraw: () => void;
};

export function WeeklyIntentCard({
  dashboard,
  nextRevealLabel,
  saving,
  onChoose,
  onWithdraw,
}: WeeklyIntentCardProps) {
  const cycle = dashboard?.currentCycle ?? null;
  const isOptedIn = cycle?.participationStatus === "OPTED_IN";
  const currentIntent = cycle?.intent ?? null;
  // Sticky carry-over: server kept us OPTED_IN but cleared intent — the user
  // must explicitly re-pick this round before they can be matched.
  const needsIntentReselect = isOptedIn && !currentIntent;
  const cardAccent = currentIntent
    ? WEEKLY_INTENT_VISUALS[currentIntent].accent
    : "var(--accent)";
  const cardClassName = `weekly-intent-card${currentIntent ? " is-locked" : ""}`;
  const cardStyle = {
    "--intent-color": cardAccent,
  } as CSSProperties;
  const deadlineLabel = cycle
    ? formatCycleDeadline(cycle.participationDeadline)
    : null;

  let statusPill: { label: string; tone: "default" | "pending" | "off" } = {
    label: "本轮未开放",
    tone: "off",
  };
  if (cycle) {
    if (currentIntent) {
      statusPill = {
        label: `本周锁定：${WEEKLY_INTENT_LABELS[currentIntent].primary}`,
        tone: "default",
      };
    } else if (needsIntentReselect) {
      statusPill = { label: "上周已参与 · 待选本周意图", tone: "pending" };
    } else {
      statusPill = { label: "本轮未参与", tone: "off" };
    }
  }

  const statusPillClassName =
    statusPill.tone === "pending"
      ? "weekly-intent-status-pill is-pending"
      : statusPill.tone === "off"
        ? "weekly-intent-status-pill is-off"
        : "weekly-intent-status-pill";

  return (
    <div className={cardClassName} style={cardStyle}>
      <div className="weekly-intent-header">
        <h2 className="weekly-intent-title">本周你想找什么？</h2>
        <p className="weekly-intent-subtitle">
          选择 Friend / Date / Both 之一作为本轮的硬约束 — BOTH 可与任意意图相容，FRIEND
          与 DATE 互斥。每个新轮次都需要重新选择。
        </p>
      </div>

      <ul className="weekly-intent-meta">
        <li className="weekly-intent-meta-chip">
          下次揭晓 <strong>{nextRevealLabel ?? "暂无开放轮次"}</strong>
        </li>
        {deadlineLabel ? (
          <li className="weekly-intent-meta-chip">
            报名截止 <strong>{deadlineLabel}</strong>
          </li>
        ) : null}
        <li>
          <span className={statusPillClassName}>{statusPill.label}</span>
        </li>
      </ul>

      {needsIntentReselect ? (
        <div className="weekly-intent-callout" role="status">
          <span className="weekly-intent-callout-icon" aria-hidden="true">
            !
          </span>
          <span>
            上一轮你参与过，本周仍保留报名状态，但
            <strong>本周意图必须重选</strong>
            后才会进入匹配池。请在下方挑一项。
          </span>
        </div>
      ) : null}

      {!cycle ? (
        <p className="dashboard-muted" style={{ margin: 0 }}>
          当前没有开放中的轮次；下一轮上线后再回到这里设置本周意图。
        </p>
      ) : (
        <ul className="weekly-intent-options">
          {WEEKLY_INTENTS.map((intent) => {
            const meta = WEEKLY_INTENT_LABELS[intent];
            const visual = WEEKLY_INTENT_VISUALS[intent];
            const active = currentIntent === intent;
            const optionStyle = {
              "--opt-color": visual.accent,
            } as CSSProperties;
            return (
              <li key={intent}>
                <button
                  type="button"
                  className={
                    active
                      ? "weekly-intent-option is-active"
                      : "weekly-intent-option"
                  }
                  style={optionStyle}
                  disabled={saving}
                  aria-pressed={active}
                  onClick={() => {
                    if (!active) onChoose(intent);
                  }}
                >
                  <div className="weekly-intent-option-head">
                    <span
                      className="weekly-intent-option-glyph"
                      aria-hidden="true"
                    >
                      {visual.glyph}
                    </span>
                    <div className="weekly-intent-option-titles">
                      <p className="weekly-intent-option-primary">
                        {meta.primary}
                      </p>
                      <p className="weekly-intent-option-subtitle">
                        {meta.subtitle}
                      </p>
                    </div>
                    <span
                      className="weekly-intent-option-check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  </div>
                  <p className="weekly-intent-option-description">
                    {meta.description}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {cycle ? (
        <div className="weekly-intent-footer">
          <p className="weekly-intent-footer-note">
            {currentIntent
              ? "可在截止前随时更换；切换不同意图也算同一轮报名，不会重复占用名额。"
              : "选择任意一项后，本周即报名成功；BOTH 与所有人相容，是兜底选项。"}
          </p>
          {isOptedIn ? (
            <button
              type="button"
              className="button-secondary"
              disabled={saving}
              onClick={onWithdraw}
            >
              {saving ? "更新中…" : "退出本轮"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
