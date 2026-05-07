"use client";

import {
  REPORT_FORM_SECTION_ID,
  formatCycleRevealAt,
  limitedHistoryExplanation,
  reportHandlingChipLabel,
} from "../_lib/format";
import { MatchExplanation } from "./MatchExplanation";
import type {
  DashboardHistoryItem,
} from "../_lib/types";
import { useLocale } from "../../locale-context";

type MatchHistoryListProps = {
  history: DashboardHistoryItem[];
  currentUserId: string;
  saving: null | "contact" | "report";
  reportFormIsOpenForMatch: (matchId: string) => boolean;
  onRequestContact: (matchId: string) => void;
  onToggleReport: (matchId: string) => void;
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
}: MatchHistoryListProps) {
  const { locale } = useLocale();
  const copy =
    locale === "zh-CN"
      ? {
          empty:
            "暂无历史记录。等你参与并经过几轮揭晓后，这里会出现最近几次匹配。",
          joined: "已参加",
          notJoined: "未参加",
          notParticipated: "该轮你未报名参加。",
          unmatched: "你参加了该轮，但未匹配到对象。",
          score: "匹配度",
          hiddenBeforeIntro: "未引荐前不展示对方学校、昵称等可识别信息。",
          email: "联络邮箱：",
          intro: "对方介绍：",
          introduced: "已引荐",
          sending: "发送中…",
          requestContact: "双方引荐联系",
          report: "举报",
        }
      : {
          empty:
            "No history yet. After you join and a few rounds are revealed, recent matches will appear here.",
          joined: "Joined",
          notJoined: "Not joined",
          notParticipated: "You did not join this round.",
          unmatched: "You joined this round, but no match was found.",
          score: "Score",
          hiddenBeforeIntro:
            "School, display name, and other identifying information stay hidden before introduction.",
          email: "Contact email: ",
          intro: "Intro: ",
          introduced: "Introduced",
          sending: "Sending...",
          requestContact: "Request introduction",
          report: "Report",
        };

  if (history.length === 0) {
    return (
      <p className="app-card-muted">
        {copy.empty}
      </p>
    );
  }

  return (
    <ul className="app-history-list">
      {history.map((item) => {
        const participationLabel =
          item.participationStatus === "OPTED_IN" ? copy.joined : copy.notJoined;

        return (
          <li key={item.cycleId} className="app-history-card">
            <div className="app-history-card-head">
              <h3 className="app-history-title">{item.codename}</h3>
              <p className="app-history-meta">
                {formatCycleRevealAt(item.revealAt, locale)} · {participationLabel}
              </p>
            </div>
            {item.result === "NOT_PARTICIPATED" ? (
              <p className="app-card-muted">{copy.notParticipated}</p>
            ) : null}
            {item.result === "UNMATCHED" ? (
              <p className="app-card-muted">
                {copy.unmatched}
              </p>
            ) : null}
            {item.result === "MATCHED" && item.visibility === "LIMITED" ? (
              <p className="app-card-muted">
                {limitedHistoryExplanation(item.limitedReason, locale)}
              </p>
            ) : null}
            {item.result === "MATCHED" &&
            item.visibility === "VISIBLE" &&
            item.match ? (
              <div className="app-history-match-body">
                {(() => {
                  const hm = item.match;
                  const counterpart =
                    hm.participants.find((p) => p.userId !== currentUserId) ??
                    null;
                  const introducedRow = Boolean(hm.introducedAt);
                  return (
                    <>
                      <span className="app-match-score">
                        {copy.score} <strong>{hm.score.toFixed(1)}</strong> / 100
                      </span>
                      {!introducedRow ? (
                        <p className="app-card-muted">
                          {copy.hiddenBeforeIntro}
                        </p>
                      ) : null}
                      {introducedRow && counterpart?.email ? (
                        <p className="form-success app-match-email">
                          {copy.email}
                          {counterpart.email}
                        </p>
                      ) : null}
                      {introducedRow && counterpart?.introLine ? (
                        <p className="app-card-muted app-match-intro">
                          {copy.intro}
                          {counterpart.introLine}
                        </p>
                      ) : null}
                      <MatchExplanation
                        reason={hm.reason}
                        reasons={hm.reasons}
                        conversationTopics={hm.conversationTopics}
                      />
                      <div className="auth-actions">
                        {introducedRow ? (
                          <span className="domain-chip">{copy.introduced}</span>
                        ) : (
                          <button
                            className="button-primary"
                            disabled={saving === "contact"}
                            type="button"
                            onClick={() => onRequestContact(hm.id)}
                          >
                            {saving === "contact"
                              ? copy.sending
                              : copy.requestContact}
                          </button>
                        )}
                        {(() => {
                          const label = reportHandlingChipLabel(
                            hm.reportStatus,
                            locale,
                          );
                          return label ? (
                            <span className="domain-chip">{label}</span>
                          ) : (
                            <button
                              className="button-secondary"
                              aria-controls={REPORT_FORM_SECTION_ID}
                              aria-expanded={reportFormIsOpenForMatch(hm.id)}
                              disabled={saving === "report"}
                              type="button"
                              onClick={() => onToggleReport(hm.id)}
                            >
                              {copy.report}
                            </button>
                          );
                        })()}
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
