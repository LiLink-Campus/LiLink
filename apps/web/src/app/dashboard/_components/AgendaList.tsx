"use client";

import Link from "next/link";
import { useState } from "react";
import { trackMeetupEntryClicked } from "../../../lib/product-analytics";
import type { AgendaItem, AgendaItemAction } from "../_lib/agenda";
import { AGENDA_ICONS } from "./agenda-icons";
import styles from "./AgendaList.module.css";

const PRIORITY_LABELS: Record<AgendaItem["priority"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function statusGlyph(status: AgendaItem["status"]) {
  if (status === "done") return "✓";
  if (status === "attention") return "!";
  if (status === "celebrate") return "✓";
  return "";
}

function statusLabel(status: AgendaItem["status"]) {
  if (status === "done") return "已完成";
  if (status === "attention") return "需关注";
  if (status === "waiting") return "等待中";
  if (status === "celebrate") return "新进展";
  return "待完成";
}

function actionClassName(variant: AgendaItemAction["variant"]) {
  if (variant === "primary") return "ui-button ui-button--primary";
  if (variant === "secondary") return "ui-button ui-button--secondary";
  return "ui-button ui-button--ghost";
}

function priorityClassName(priority: AgendaItem["priority"]) {
  if (priority === "high") return styles.priorityHigh;
  if (priority === "medium") return styles.priorityMedium;
  return styles.priorityLow;
}

function statusClassName(status: AgendaItem["status"]) {
  if (status === "done") return styles.done;
  if (status === "attention") return styles.attention;
  if (status === "waiting") return styles.waiting;
  if (status === "celebrate") return styles.celebrate;
  return styles.todoStatus;
}

function meetupMetadataFromHref(href: string | undefined) {
  if (!href?.startsWith("/dashboard/meetup")) return null;
  try {
    const url = new URL(href, window.location.origin);
    const metadata: Record<string, string> = {};
    const matchId = url.searchParams.get("matchId");
    if (matchId) {
      metadata.matchId = matchId;
    }
    if (url.pathname !== "/dashboard/meetup/start") {
      const sessionMatch = /^\/dashboard\/meetup\/([^/]+)$/.exec(url.pathname);
      if (sessionMatch?.[1]) {
        metadata.sessionId = decodeURIComponent(sessionMatch[1]);
      }
    }
    return metadata;
  } catch {
    return {};
  }
}

function meetupMetadataFromAction(action: AgendaItemAction) {
  const hrefMetadata = meetupMetadataFromHref(action.href);
  if (!hrefMetadata) return null;
  return {
    ...hrefMetadata,
    ...(action.meetupEntryMetadata ?? {}),
  };
}

export function AgendaList({
  items,
  pendingCount,
  onAction,
  savingAction,
}: {
  items: AgendaItem[];
  pendingCount: number;
  onAction: (itemId: AgendaItem["id"], action: AgendaItemAction) => void;
  savingAction: boolean;
}) {
  const mobileHiddenCount = Math.max(0, items.length - 3);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const isMobileCollapsed = mobileHiddenCount > 0 && !mobileExpanded;

  return (
    <section className={styles.agenda} aria-label="本周议程">
      <header className={styles.head}>
        <span className={styles.eyebrow}>本周议程 · AGENDA</span>
        <span className={styles.meta}>
          <span className={styles.count}>
            {pendingCount > 0 ? `${pendingCount} 项待处理` : "全部完成"}
          </span>
          {mobileHiddenCount > 0 ? (
            <button
              type="button"
              className={styles.mobileMore}
              onClick={() => setMobileExpanded((expanded) => !expanded)}
            >
              {mobileExpanded ? "收起" : `展开 ${mobileHiddenCount} 项`}
            </button>
          ) : null}
        </span>
      </header>

      <ul
        className={`${styles.list} ${
          isMobileCollapsed ? styles.isCollapsed : ""
        }`}
      >
        {items.map((item) => {
          const Icon = AGENDA_ICONS[item.icon];
          return (
            <li
              key={item.id}
              className={`${styles.row} ${priorityClassName(item.priority)} ${statusClassName(item.status)}`}
            >
              <div className={styles.leading}>
                <span
                  className={styles.check}
                  role="img"
                  aria-label={statusLabel(item.status)}
                >
                  {statusGlyph(item.status)}
                </span>
                <span className={styles.icon} aria-hidden="true">
                  <Icon />
                </span>
              </div>
              <div className={styles.main}>
                <div className={styles.titleLine}>
                  <p className={styles.title}>{item.title}</p>
                  <span className={styles.priorityBadge}>
                    {PRIORITY_LABELS[item.priority]}
                  </span>
                </div>
                <p className={styles.sub}>{item.subtitle}</p>
                {item.progress ? (
                  <div className={styles.progress}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.confirmed}
                        style={{
                          width: `${clampPercent(item.progress.confirmedPercent)}%`,
                        }}
                      />
                      <div
                        className={styles.unconfirmed}
                        style={{
                          width: `${clampPercent(item.progress.unconfirmedPercent)}%`,
                        }}
                      />
                    </div>
                    <span className={styles.progressVal}>
                      {item.progress.confirmedPercent}%
                    </span>
                  </div>
                ) : null}
              </div>
              {item.actions.length > 0 ? (
                <div className={styles.actions}>
                  {item.actions.map((action, index) =>
                    action.kind === "link" && action.href ? (
                      <Link
                        key={`${item.id}-${index}`}
                        href={action.href}
                        className={actionClassName(action.variant)}
                        onClick={() => {
                          const metadata = meetupMetadataFromAction(action);
                          if (metadata) trackMeetupEntryClicked(metadata);
                        }}
                      >
                        {action.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        key={`${item.id}-${index}`}
                        className={actionClassName(action.variant)}
                        onClick={() => onAction(item.id, action)}
                        disabled={savingAction}
                      >
                        {savingAction && action.loadingLabel
                          ? `${action.loadingLabel}…`
                          : action.label}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
