import { dcx } from "../../_lib/dashboard-class-names";
import type { MeetupSessionResponse } from "../../../../lib/api";
import { sessionIsTerminal } from "./meetup-format";

function avatarInitialFor(displayName: string | null | undefined) {
  const source = (displayName ?? "TA").trim();
  if (!source) return "TA";
  const first = Array.from(source)[0];
  return first ? first.toUpperCase() : "TA";
}

function turnContent(session: MeetupSessionResponse): {
  label: string;
  tone: "attention" | "waiting" | "on";
} {
  if (sessionIsTerminal(session)) {
    return { label: "已结束", tone: "waiting" };
  }
  if (session.status === "LOCKED") {
    return { label: "已确认", tone: "on" };
  }
  if (session.userTurnStatus === "NEEDS_YOUR_RESPONSE") {
    return { label: "轮到你", tone: "attention" };
  }
  if (session.userTurnStatus === "WAITING_FOR_COUNTERPART") {
    return { label: "等待对方", tone: "waiting" };
  }
  return { label: "协商中", tone: "waiting" };
}

/**
 * Slim top strip showing the counterpart's avatar + name and a turn pill
 * (轮到你 / 等待对方 / 已确认). Anchors users in "who am I talking with and
 * whose move is it?" before they look at the action card.
 */
export function MeetupParticipantStrip({
  session,
  currentUserId,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  const counterpart = session.participants.find(
    (participant) => participant.userId !== currentUserId,
  );
  const name = counterpart?.displayName ?? session.counterpartDisplayName ?? "对方";
  const initial = avatarInitialFor(name);
  const turn = turnContent(session);

  return (
    <div className={dcx("v2-meetup-participant-strip")} aria-label="参与者状态">
      <span className={dcx("v2-meetup-participant-avatar")} aria-hidden="true">
        {initial}
      </span>
      <span className={dcx("v2-meetup-participant-name")}>{name}</span>
      <span className={dcx(`v2-meetup-participant-turn tone-${turn.tone}`)}>
        <span className={dcx("v2-meetup-participant-turn-dot")} aria-hidden="true" />
        {turn.label}
      </span>
    </div>
  );
}
