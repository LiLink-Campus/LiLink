"use client";

import { type CSSProperties } from "react";
import {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  WEEKLY_INTENT_VISUALS,
  type WeeklyIntent,
} from "../../../lib/weekly-intent";
import {
  canEditCurrentCycleParticipation,
  formatCycleDeadline,
} from "../_lib/format";
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
  const canEditParticipation = canEditCurrentCycleParticipation(cycle);
  const currentCycleIsLocked = cycle !== null && !canEditParticipation;
  // Sticky carry-over normally preserves the previous intent for OPTED_IN
  // users. If this branch is hit, the participation is missing a usable value.
  const hasMissingIntent = isOptedIn && !currentIntent && canEditParticipation;
  const cardAccent = currentIntent
    ? WEEKLY_INTENT_VISUALS[currentIntent].accent
    : "var(--accent)";
  const cardClassName = `weekly-intent-card${
    currentIntent || currentCycleIsLocked ? " is-locked" : ""
  }`;
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
    if (currentCycleIsLocked) {
      statusPill = { label: "本轮已锁定", tone: "default" };
    } else if (currentIntent) {
      statusPill = {
        label: `本周锁定：${WEEKLY_INTENT_LABELS[currentIntent].primary}`,
        tone: "default",
      };
    } else if (hasMissingIntent) {
      statusPill = { label: "本周意图待确认", tone: "pending" };
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
          {currentCycleIsLocked
            ? "本轮报名已经截止。你仍可继续注册和填写问卷，但本轮不能参加、退出或修改意图。"
            : "选择 Friend / Date / Both 之一作为本轮的硬约束 — BOTH 可与任意意图相容，FRIEND 与 DATE 互斥。默认沿用上一轮，也可在截止前改成别的。"}
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

      {currentCycleIsLocked ? (
        <div className="weekly-intent-callout" role="status">
          <span className="weekly-intent-callout-icon" aria-hidden="true">
            !
          </span>
          <span>
            本轮已进入预生成或等待揭晓阶段。现在只能继续完善问卷资料，不能再参加本轮或调整本周意图。
          </span>
        </div>
      ) : hasMissingIntent ? (
        <div className="weekly-intent-callout" role="status">
          <span className="weekly-intent-callout-icon" aria-hidden="true">
            !
          </span>
          <span>
            当前这轮还没有保存可用的本周意图。请在下方确认
            <strong> Friend、Date 或 Both </strong>
            之一，匹配会按这次确认后的设置计算。
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
                  disabled={saving || currentCycleIsLocked}
                  aria-pressed={active}
                  onClick={() => {
                    if (!active && !currentCycleIsLocked) onChoose(intent);
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
            {currentCycleIsLocked
              ? "本轮报名已锁定；你可以继续修改问卷资料，为下一轮开放时的报名和匹配做准备。"
              : currentIntent
              ? "可在截止前随时更换；切换不同意图也算同一轮报名，不会重复占用名额。"
              : "选择任意一项后，本周即报名成功；BOTH 与所有人相容，是兜底选项。"}
          </p>
          {isOptedIn && !currentCycleIsLocked ? (
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
