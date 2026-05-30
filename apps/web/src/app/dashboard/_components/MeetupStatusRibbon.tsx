import { dcx } from "../_lib/dashboard-class-names";
import Link from "next/link";
import { trackMeetupEntryClicked } from "../../../lib/product-analytics";
import type {
  DashboardMeetupSummary,
  DashboardTask,
} from "../_lib/types";
import { ArrowRightIcon } from "./icons";

type StepKey = "propose" | "select" | "confirm" | "meet";
type StepStatus = "complete" | "active" | "pending" | "muted";

const STEP_LABELS: Record<StepKey, string> = {
  propose: "发起方案",
  select: "选择可行项",
  confirm: "最终确认",
  meet: "见面",
};

function stepStatesForSummary(
  summary: DashboardMeetupSummary,
): Record<StepKey, StepStatus> {
  const terminal =
    summary.status === "CANCELED" ||
    summary.status === "EXPIRED" ||
    summary.status === "ARCHIVED";

  if (terminal) {
    return { propose: "muted", select: "muted", confirm: "muted", meet: "muted" };
  }

  const progress = summary.progressStatus;
  switch (progress) {
    case "NOT_STARTED":
      return {
        propose: "active",
        select: "pending",
        confirm: "pending",
        meet: "pending",
      };
    case "NEGOTIATING":
    case "LOCATION_CONFIRMED_TIME_PENDING":
    case "TIME_CONFIRMED_LOCATION_PENDING":
      return {
        propose: "complete",
        select: "active",
        confirm: "pending",
        meet: "pending",
      };
    case "AWAITING_FINAL_CONFIRMATION":
      return {
        propose: "complete",
        select: "complete",
        confirm: "active",
        meet: "pending",
      };
    case "LOCKED":
      return {
        propose: "complete",
        select: "complete",
        confirm: "complete",
        meet: "active",
      };
    default:
      return { propose: "muted", select: "muted", confirm: "muted", meet: "muted" };
  }
}

function pillForTask(
  summary: DashboardMeetupSummary,
  task: DashboardTask | null,
): { label: string; tone: "attention" | "waiting" | "on" | "default" } {
  if (summary.status === "LOCKED") {
    return { label: "已确认", tone: "on" };
  }
  if (
    summary.status === "CANCELED" ||
    summary.status === "EXPIRED" ||
    summary.status === "ARCHIVED"
  ) {
    return { label: "已结束", tone: "default" };
  }
  if (task) {
    if (task.userTurnStatus === "NEEDS_YOUR_RESPONSE") {
      return { label: "轮到你", tone: "attention" };
    }
    if (task.userTurnStatus === "WAITING_FOR_COUNTERPART") {
      return { label: "等对方", tone: "waiting" };
    }
  }
  return { label: "协商中", tone: "default" };
}

/**
 * Compact 4-step ribbon shown on the Match page when a meetup session
 * exists. Communicates "where in the flow are we" + "whose turn is it"
 * without taking over the page. Clicking dives into the full meetup detail.
 */
export function MeetupStatusRibbon({
  summary,
  task,
}: {
  summary: DashboardMeetupSummary;
  task: DashboardTask | null;
}) {
  const stepStates = stepStatesForSummary(summary);
  const pill = pillForTask(summary, task);
  const isLocked = summary.status === "LOCKED";
  const subtitle = isLocked
    ? "时间和地点已经锁定。"
    : task?.text || "可以继续推进见面安排。";

  return (
    <Link
      href={summary.href}
      className={dcx("v2-meetup-ribbon")}
      aria-label="第一次见面安排"
      onClick={() =>
        trackMeetupEntryClicked({
          sessionId: summary.sessionId,
          matchId: summary.matchId,
        })
      }
    >
      <div className={dcx("v2-meetup-ribbon-head")}>
        <span className={dcx("v2-meetup-ribbon-title")}>
          <small>Meetup</small>
          <strong>第一次见面安排</strong>
        </span>
        <span className={dcx(`v2-meetup-ribbon-pill tone-${pill.tone}`)}>
          {pill.label}
        </span>
      </div>
      <p className={dcx("v2-meetup-ribbon-body")}>{subtitle}</p>
      <ol className={dcx("v2-meetup-ribbon-steps")} aria-hidden="true">
        {(Object.keys(STEP_LABELS) as StepKey[]).map((key) => (
          <li
            key={key}
            className={dcx(`v2-meetup-ribbon-step is-${stepStates[key]}`)}
          >
            <span className={dcx("v2-meetup-ribbon-step-bar")} />
            <span className={dcx("v2-meetup-ribbon-step-label")}>
              {STEP_LABELS[key]}
            </span>
          </li>
        ))}
      </ol>
      <div className={dcx("v2-meetup-ribbon-foot")}>
        <span>
          {isLocked ? "查看确认的时间地点" : "进入完整协商面板"}
        </span>
        <ArrowRightIcon />
      </div>
    </Link>
  );
}
