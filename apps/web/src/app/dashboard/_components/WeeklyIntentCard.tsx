"use client";

import { type CSSProperties } from "react";
import {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LONG_MATCHING_RULE_COPY,
  WEEKLY_INTENT_VISUALS,
  weeklyIntentLabelsFor,
  type WeeklyIntent,
} from "../../../lib/weekly-intent";
import { useLocale } from "../../locale-context";
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
  const { locale } = useLocale();
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
    ? formatCycleDeadline(cycle.participationDeadline, locale)
    : null;

  let statusPill: { label: string; tone: "default" | "pending" | "off" } = {
    label: locale === "zh-CN" ? "本轮未开放" : "No open round",
    tone: "off",
  };
  if (cycle) {
    if (currentCycleIsLocked) {
      statusPill = {
        label: locale === "zh-CN" ? "本轮已锁定" : "Round locked",
        tone: "default",
      };
    } else if (currentIntent) {
      statusPill = {
        label:
          locale === "zh-CN"
            ? `本周锁定：${weeklyIntentLabelsFor(currentIntent, locale).primary}`
            : `Locked: ${weeklyIntentLabelsFor(currentIntent, locale).primary}`,
        tone: "default",
      };
    } else if (hasMissingIntent) {
      statusPill = {
        label: locale === "zh-CN" ? "本周意图待确认" : "Intent needed",
        tone: "pending",
      };
    } else {
      statusPill = {
        label: locale === "zh-CN" ? "本轮未参与" : "Not joined",
        tone: "off",
      };
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
        <h2 className="weekly-intent-title">
          {locale === "zh-CN"
            ? "本周你想找什么？"
            : "What are you looking for this week?"}
        </h2>
        <p className="weekly-intent-subtitle">
          {currentCycleIsLocked
            ? locale === "zh-CN"
              ? "本轮报名已经截止。你仍可继续注册和填写问卷，但本轮不能参加、退出或修改意图。"
              : "Registration for this round has closed. You can still edit your questionnaire, but you cannot join, leave, or change intent for this round."
            : WEEKLY_INTENT_LONG_MATCHING_RULE_COPY[locale]}
        </p>
      </div>

      <ul className="weekly-intent-meta">
        <li className="weekly-intent-meta-chip">
          {locale === "zh-CN" ? "下次揭晓" : "Next reveal"}{" "}
          <strong>
            {nextRevealLabel ??
              (locale === "zh-CN" ? "暂无开放轮次" : "No open round")}
          </strong>
        </li>
        {deadlineLabel ? (
          <li className="weekly-intent-meta-chip">
            {locale === "zh-CN" ? "报名截止" : "Deadline"}{" "}
            <strong>{deadlineLabel}</strong>
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
            {locale === "zh-CN"
              ? "本轮已进入预生成或等待揭晓阶段。现在只能继续完善问卷资料，不能再参加本轮或调整本周意图。"
              : "This round is already preparing or waiting for reveal. You can still edit your questionnaire, but cannot join or adjust intent."}
          </span>
        </div>
      ) : hasMissingIntent ? (
        <div className="weekly-intent-callout" role="status">
          <span className="weekly-intent-callout-icon" aria-hidden="true">
            !
          </span>
          <span>
            {locale === "zh-CN"
              ? "当前这轮还没有保存可用的本周意图。请在下方确认"
              : "This round has no usable saved intent yet. Choose "}
            <strong>
              {locale === "zh-CN" ? " Friend、Date 或 Both " : "Friend, Date, or Both"}
            </strong>
            {locale === "zh-CN"
              ? "之一，匹配会按这次确认后的设置计算。"
              : "below; matching will use your confirmed setting."}
          </span>
        </div>
      ) : null}

      {!cycle ? (
        <p className="app-muted">
          {locale === "zh-CN"
            ? "当前没有开放中的轮次；下一轮上线后再回到这里设置本周意图。"
            : "There is no open round right now. Come back when the next round opens to set your intent."}
        </p>
      ) : (
        <ul className="weekly-intent-options">
          {WEEKLY_INTENTS.map((intent) => {
            const meta = weeklyIntentLabelsFor(intent, locale);
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
              ? locale === "zh-CN"
                ? "本轮报名已锁定；你可以继续修改问卷资料，为下一轮开放时的报名和匹配做准备。"
                : "This round is locked. You can still edit your questionnaire for the next round."
              : currentIntent
                ? locale === "zh-CN"
                  ? "可在截止前随时更换；切换不同意图也算同一轮报名，不会重复占用名额。"
                  : "You can change this before the deadline. Changing intent does not use another spot."
                : locale === "zh-CN"
                  ? "选择任意一项后，本周即报名成功；BOTH 与所有人相容，是兜底选项。"
                  : "Choose any option to join this week. BOTH is the broadest fallback."}
          </p>
          {isOptedIn && !currentCycleIsLocked ? (
            <button
              type="button"
              className="button-secondary"
              disabled={saving}
              onClick={onWithdraw}
            >
              {saving
                ? locale === "zh-CN"
                  ? "更新中…"
                  : "Updating..."
                : locale === "zh-CN"
                  ? "退出本轮"
                  : "Leave round"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
