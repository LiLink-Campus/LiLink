"use client";

import { dcx } from "../_lib/dashboard-class-names";
import Link from "next/link";
import styles from "../match/history/match-history.module.css";
import {
  REPORT_FORM_SECTION_ID,
  formatCycleRevealAt,
  limitedHistoryExplanation,
  reportHandlingChipLabel,
} from "../_lib/format";
import { CounterpartInfo } from "./CounterpartInfo";
import type { DashboardHistoryItem } from "../_lib/types";

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
  onToggleReport,
}: MatchHistoryListProps) {
  if (history.length === 0) {
    return (
      <p className={styles.description}>
        暂无历史记录。等你参与并经过几轮揭晓后，这里会出现最近几次匹配。
      </p>
    );
  }

  return (
    <ul className={styles.list}>
      {history.map((item) => {
        const participationLabel =
          item.participationStatus === "OPTED_IN" ? "已参加" : "未参加";

        return (
          <li key={item.cycleId} className={styles.card} data-result={item.result}>
            <div className={styles.cardHead}>
              <div className={styles.roundRow}><h3 className={styles.roundTitle}>{item.codename}</h3><span className={styles.result}>{item.result === "MATCHED" ? item.visibility === "LIMITED" ? "展示受限" : "匹配成功" : item.result === "UNMATCHED" ? "未匹配到" : "未参与匹配"}</span></div>
              <p className={styles.meta}>
                {formatCycleRevealAt(item.revealAt)} · {participationLabel}
              </p>
            </div>
            {item.result === "NOT_PARTICIPATED" ? (
              <p className={styles.description}>这轮你没有报名，未参与匹配。</p>
            ) : null}
            {item.result === "UNMATCHED" ? (
              <p className={styles.description}>你已参加这轮匹配，但暂未找到合适的同学。</p>
            ) : null}
            {item.result === "MATCHED" && item.visibility === "LIMITED" ? (
              <p className={styles.description}>
                {limitedHistoryExplanation(item.limitedReason)}
              </p>
            ) : null}
            {item.result === "MATCHED" &&
            item.visibility === "VISIBLE" &&
            item.match ? (
              <div className={styles.matchBody}>
                {(() => {
                  const hm = item.match;
                  const counterpart =
                    hm.participants.find((p) => p.userId !== currentUserId) ??
                    null;
                  const meetupSummary = item.meetupSummary ?? null;
                  const showMeetupFeedbackCta = Boolean(
                    meetupSummary &&
                      (meetupSummary.canSubmitFeedback ||
                        meetupSummary.currentUserFeedback),
                  );
                  const publicContact =
                    counterpart?.contact ??
                    (counterpart?.email
                      ? { label: "联络邮箱", value: counterpart.email }
                      : null);
                  return (
                    <>
                      {counterpart?.displayName && <div className={styles.person}><div><h4>{counterpart.displayName}</h4><p>{counterpart.schoolName}</p></div><span className={styles.score}>匹配度 <strong>{Math.round(hm.score)}%</strong></span></div>}
                      <details className={styles.details}><summary>查看匹配详情</summary><div className={styles.detailContent}>
                      {counterpart?.introLine ? (
                        <p className={styles.intro}>
                          对方介绍：{counterpart.introLine}
                        </p>
                      ) : null}
                      {publicContact ? (
                        <p className={styles.contact}>
                          联系方式：{publicContact.label} {publicContact.value}
                        </p>
                      ) : null}
                      <CounterpartInfo
                        gender={counterpart?.gender}
                        partnerGenders={counterpart?.partnerGenders}
                        weeklyIntent={counterpart?.weeklyIntent}
                        compact
                      />
                      <div className={styles.actions}>
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
                        {showMeetupFeedbackCta && meetupSummary ? (
                          <Link
                            className={dcx("ui-button ui-button--secondary")}
                            href={meetupSummary.href}
                          >
                            {meetupSummary.currentUserFeedback
                              ? "查看 / 修改会后反馈"
                              : "填写会后反馈"}
                          </Link>
                        ) : null}
                      </div>
                      </div></details>
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
