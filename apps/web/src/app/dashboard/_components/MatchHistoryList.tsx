"use client";

import { dcx } from "../_lib/dashboard-class-names";
import {
  REPORT_FORM_SECTION_ID,
  formatCycleRevealAt,
  limitedHistoryExplanation,
  reportHandlingChipLabel,
} from "../_lib/format";
import { CounterpartInfo } from "./CounterpartInfo";
import type { DashboardHistoryItem, MatchFeedback } from "../_lib/types";

type MatchHistoryListProps = {
  history: DashboardHistoryItem[];
  currentUserId: string;
  saving: null | "contact" | "report" | "feedback";
  reportFormIsOpenForMatch: (matchId: string) => boolean;
  onRequestContact: (matchId: string) => void;
  onToggleReport: (matchId: string) => void;
  onToggleFeedback: (matchId: string, existing: MatchFeedback | null) => void;
};

/**
 * Renders the recent-match history list. Shared between the standalone
 * /dashboard/history page (kept for direct links) and the bottom of
 * /dashboard/match where current and past rounds live together.
 */
export function MatchHistoryList({
  history,
  currentUserId,
  saving,
  reportFormIsOpenForMatch,
  onRequestContact,
  onToggleReport,
  onToggleFeedback,
}: MatchHistoryListProps) {
  if (history.length === 0) {
    return (
      <p className={dcx("ui-card-description")}>
        暂无历史记录。等你参与并经过几轮揭晓后，这里会出现最近几次匹配。
      </p>
    );
  }

  return (
    <ul className={dcx("app-history-list")}>
      {history.map((item) => {
        const participationLabel =
          item.participationStatus === "OPTED_IN" ? "已参加" : "未参加";

        return (
          <li key={item.cycleId} className={dcx("app-history-card")}>
            <div className={dcx("app-history-card-head")}>
              <h3 className={dcx("app-history-title")}>{item.codename}</h3>
              <p className={dcx("app-history-meta")}>
                {formatCycleRevealAt(item.revealAt)} · {participationLabel}
              </p>
            </div>
            {item.result === "NOT_PARTICIPATED" ? (
              <p className={dcx("ui-card-description")}>该轮你未报名参加。</p>
            ) : null}
            {item.result === "UNMATCHED" ? (
              <p className={dcx("ui-card-description")}>你参加了该轮，但未匹配到对象。</p>
            ) : null}
            {item.result === "MATCHED" && item.visibility === "LIMITED" ? (
              <p className={dcx("ui-card-description")}>
                {limitedHistoryExplanation(item.limitedReason)}
              </p>
            ) : null}
            {item.result === "MATCHED" &&
            item.visibility === "VISIBLE" &&
            item.match ? (
              <div className={dcx("app-history-match-body")}>
                {(() => {
                  const hm = item.match;
                  const counterpart =
                    hm.participants.find((p) => p.userId !== currentUserId) ??
                    null;
                  const introducedRow = Boolean(hm.introducedAt);
                  const publicContact =
                    counterpart?.contact ??
                    (counterpart?.email
                      ? { label: "联络邮箱", value: counterpart.email }
                      : null);
                  return (
                    <>
                      <span className={dcx("app-match-score")}>
                        匹配度 <strong>{hm.score.toFixed(1)}</strong> / 100
                      </span>
                      {counterpart?.displayName ? (
                        <p className={dcx("ui-card-description")}>
                          对方：{counterpart.displayName}
                          {counterpart.schoolName
                            ? ` · ${counterpart.schoolName}`
                            : ""}
                        </p>
                      ) : null}
                      {counterpart?.introLine ? (
                        <p className={dcx("ui-card-description app-match-intro")}>
                          对方介绍：{counterpart.introLine}
                        </p>
                      ) : null}
                      {!introducedRow ? (
                        <p className={dcx("ui-card-description")}>
                          交换联系方式后即可查看对方联络方式。
                        </p>
                      ) : null}
                      {introducedRow && publicContact ? (
                        <p className={dcx("ui-form-message ui-form-message--success app-match-email")}>
                          联系方式：{publicContact.label} {publicContact.value}
                        </p>
                      ) : null}
                      <CounterpartInfo
                        gender={counterpart?.gender}
                        partnerGenders={counterpart?.partnerGenders}
                        weeklyIntent={counterpart?.weeklyIntent}
                        compact
                      />
                      <div className={dcx("auth-actions")}>
                        {introducedRow ? (
                          <span className={dcx("ui-badge ui-badge--neutral")}>已引荐</span>
                        ) : (
                          <button
                            className={dcx("ui-button ui-button--primary")}
                            disabled={saving === "contact"}
                            type="button"
                            onClick={() => onRequestContact(hm.id)}
                          >
                            {saving === "contact" ? "发送中…" : "双方引荐联系"}
                          </button>
                        )}
                        {(() => {
                          const label = reportHandlingChipLabel(
                            hm.reportStatus,
                          );
                          return label ? (
                            <span className={dcx("ui-badge ui-badge--neutral")}>{label}</span>
                          ) : (
                            <button
                              className={dcx("ui-button ui-button--secondary")}
                              aria-controls={REPORT_FORM_SECTION_ID}
                              aria-expanded={reportFormIsOpenForMatch(hm.id)}
                              disabled={saving === "report"}
                              type="button"
                              onClick={() => onToggleReport(hm.id)}
                            >
                              举报
                            </button>
                          );
                        })()}
                        <button
                          className={dcx("ui-button ui-button--secondary")}
                          disabled={saving === "feedback"}
                          type="button"
                          onClick={() =>
                            onToggleFeedback(hm.id, hm.currentUserFeedback)
                          }
                        >
                          {hm.currentUserFeedback ? "查看 / 修改评价" : "填写反馈"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
