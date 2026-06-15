import { dcx } from "../../_lib/dashboard-class-names";
import { useMemo } from "react";
import type {
  MeetupMessage,
  MeetupOption,
  MeetupProposal,
  MeetupSessionResponse,
} from "../../../../lib/api";
import {
  CalendarIcon,
  CheckCircleIcon,
  ClipboardIcon,
  ClockIcon,
  MapPinIcon,
  SparklesIcon,
} from "../../_components/icons";
import {
  formatMeetupShortDateTime,
  formatMeetupTimeRange,
  optionPrimaryText,
  optionSecondaryText,
  sessionIsTerminal,
} from "./meetup-format";

export type MeetupActionState =
  | "accept"
  | "finalConfirm"
  | "waiting"
  | "needsPropose"
  | "locked"
  | "terminal"
  | "noop";

type MeetupActionTone = "attention" | "celebrate" | "waiting" | "muted";

const TONE_BY_STATE: Record<MeetupActionState, MeetupActionTone> = {
  accept: "attention",
  finalConfirm: "attention",
  waiting: "waiting",
  needsPropose: "attention",
  locked: "celebrate",
  terminal: "muted",
  noop: "muted",
};

const ICON_BY_STATE: Record<MeetupActionState, React.ReactNode> = {
  accept: <ClipboardIcon />,
  finalConfirm: <SparklesIcon />,
  waiting: <ClockIcon />,
  needsPropose: <ClipboardIcon />,
  locked: <CheckCircleIcon />,
  terminal: <ClockIcon />,
  noop: <ClockIcon />,
};

/**
 * Resolve which "现在要做" template to render based on session state.
 * Order matters — earlier branches win when multiple are true.
 */
export function resolveMeetupActionState(
  session: MeetupSessionResponse,
): MeetupActionState {
  if (sessionIsTerminal(session)) return "terminal";
  if (session.status === "LOCKED") return "locked";
  if (session.availableActions.accept.enabled && session.currentPendingProposal) {
    return "accept";
  }
  if (session.availableActions.finalConfirm.enabled) {
    return "finalConfirm";
  }
  if (session.userTurnStatus === "WAITING_FOR_COUNTERPART") {
    return "waiting";
  }
  if (session.availableActions.propose.enabled) {
    return "needsPropose";
  }
  return "noop";
}

function findLatestMessageBy(
  session: MeetupSessionResponse,
  predicate: (message: MeetupMessage) => boolean,
): MeetupMessage | null {
  const sorted = [...session.messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (predicate(sorted[index])) return sorted[index];
  }
  return null;
}

function findLatestMyProposal(
  session: MeetupSessionResponse,
  currentUserId: string,
): MeetupProposal | null {
  const message = findLatestMessageBy(
    session,
    (msg) =>
      (msg.type === "PROPOSE" || msg.type === "REVISE_AFTER_LOCK") &&
      msg.actorUserId === currentUserId &&
      msg.proposal !== null,
  );
  return message?.proposal ?? null;
}

function findLatestCounterpartProposal(
  session: MeetupSessionResponse,
  currentUserId: string,
): MeetupProposal | null {
  const message = findLatestMessageBy(
    session,
    (msg) =>
      (msg.type === "PROPOSE" || msg.type === "REVISE_AFTER_LOCK") &&
      msg.actorUserId !== currentUserId &&
      msg.proposal !== null,
  );
  return message?.proposal ?? null;
}

export type MeetupActionCardProps = {
  session: MeetupSessionResponse;
  currentUserId: string;
  selectedTimeId: string | null;
  selectedLocationId: string | null;
  noteText: string;
  onSelectTime: (id: string | null) => void;
  onSelectLocation: (id: string | null) => void;
  onNoteChange: (text: string) => void;
  state: MeetupActionState;
};

/**
 * The "现在要做" card — the single most prominent surface on the meetup
 * page. Renders one of six visual templates depending on session state.
 * For the accept-flow it inlines the option pickers; for read-only states
 * it shows a summary list.
 */
export function MeetupActionCard(props: MeetupActionCardProps) {
  const { session, state } = props;
  const tone = TONE_BY_STATE[state];
  const icon = ICON_BY_STATE[state];

  let head: { eyebrow: string; title: string; subtitle: string };
  let body: React.ReactNode;

  switch (state) {
    case "accept": {
      head = {
        eyebrow: "现在要做",
        title: "选择一个你能接受的时间和地点",
        subtitle:
          "对方提议了以下方案，可以只接受其中一项；选好后点底部的「确认所选」交回对方。",
      };
      body = <AcceptBody {...props} />;
      break;
    }
    case "finalConfirm": {
      head = {
        eyebrow: "现在要做",
        title: "等你最终确认",
        subtitle:
          "对方已接受完整方案。确认后这次见面会锁定，双方都会收到通知；见面前你和对方还各有 1 次修改机会。",
      };
      body = <FinalConfirmBody session={session} currentUserId={props.currentUserId} />;
      break;
    }
    case "waiting": {
      head = {
        eyebrow: "你已发起方案",
        title: "等待对方回应",
        subtitle: `${session.counterpartDisplayName ?? "对方"}查看后会在他们的页面回应；他们一动作，这里会立刻切回你处理。`,
      };
      body = <WaitingBody session={session} currentUserId={props.currentUserId} />;
      break;
    }
    case "needsPropose": {
      const isFirst = session.messages.length === 0;
      head = {
        eyebrow: "轮到你",
        title: isFirst ? "发起见面方案" : "重新提议方案",
        subtitle: "给对方 2–3 个时间和地点候选；点底部的「填写方案」开始。",
      };
      body = <NeedsProposeBody session={session} currentUserId={props.currentUserId} />;
      break;
    }
    case "locked": {
      head = {
        eyebrow: "已确认",
        title: "见面安排已锁定",
        subtitle:
          "时间和地点已经确认。见面前 24 小时内会在首页提醒你；如果计划有变，下方的「修改安排」按钮可以发起一次修改。",
      };
      body = <LockedBody session={session} />;
      break;
    }
    case "terminal": {
      head = {
        eyebrow: "已结束",
        title:
          session.status === "CANCELED"
            ? "本次安排已取消"
            : session.status === "EXPIRED"
              ? "本次协商已过期"
              : "本次安排已归档",
        subtitle:
          "当前版本不支持重新发起；可以回到「我的匹配」查看本轮的其它信息。",
      };
      body = null;
      break;
    }
    case "noop":
    default: {
      head = {
        eyebrow: "暂无操作",
        title: "暂无需要处理的步骤",
        subtitle:
          "当前状态不需要你继续填写；如状态变化，首页与本页会立刻同步。",
      };
      body = null;
    }
  }

  return (
    <section className={dcx(`v2-meetup-action-card tone-${tone}`)} aria-label={head.title}>
      <header className={dcx("v2-meetup-action-head")}>
        <span className={dcx("v2-meetup-action-head-icon")} aria-hidden="true">
          {icon}
        </span>
        <div className={dcx("v2-meetup-action-head-body")}>
          <span className={dcx("v2-meetup-action-eyebrow")}>{head.eyebrow}</span>
          <h2 className={dcx("v2-meetup-action-title")}>{head.title}</h2>
        </div>
      </header>
      <p className={dcx("v2-meetup-action-subtitle")}>{head.subtitle}</p>
      {body}
    </section>
  );
}

function AcceptBody({
  session,
  selectedTimeId,
  selectedLocationId,
  noteText,
  onSelectTime,
  onSelectLocation,
  onNoteChange,
}: MeetupActionCardProps) {
  const proposal = session.currentPendingProposal;
  if (!proposal) return null;

  const timeOptions = proposal.options.filter((option) => option.kind === "TIME");
  const locationOptions = proposal.options.filter(
    (option) => option.kind === "LOCATION",
  );

  const proposalMessage = session.messages.find(
    (msg) => msg.proposal?.id === proposal.id,
  ) ?? null;
  const counterpartNote = proposalMessage?.noteText ?? null;

  return (
    <>
      {counterpartNote ? (
        <div className={dcx("v2-meetup-action-counterpart-note")}>
          <span className={dcx("v2-meetup-action-section-label")}>对方的备注</span>
          <p>{counterpartNote}</p>
        </div>
      ) : null}

      {timeOptions.length > 0 ? (
        <div className={dcx("v2-meetup-action-section")}>
          <span className={dcx("v2-meetup-action-section-label")}>
            <ClockIcon />
            选择一个时间
          </span>
          {timeOptions.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              kind="TIME"
              selected={selectedTimeId === option.id}
              onSelect={() =>
                onSelectTime(selectedTimeId === option.id ? null : option.id)
              }
            />
          ))}
        </div>
      ) : null}

      {locationOptions.length > 0 ? (
        <div className={dcx("v2-meetup-action-section")}>
          <span className={dcx("v2-meetup-action-section-label")}>
            <MapPinIcon />
            选择一个地点
          </span>
          {locationOptions.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              kind="LOCATION"
              selected={selectedLocationId === option.id}
              onSelect={() =>
                onSelectLocation(
                  selectedLocationId === option.id ? null : option.id,
                )
              }
            />
          ))}
        </div>
      ) : null}

      <label className={dcx("v2-meetup-action-note")}>
        <span>给对方的备注（可选；拒绝时建议补一句原因）</span>
        <textarea
          value={noteText}
          maxLength={500}
          placeholder="例如：这个时间可以，但希望地点再近一点。"
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
    </>
  );
}

function OptionRow({
  option,
  kind,
  selected,
  onSelect,
}: {
  option: MeetupOption;
  kind: "TIME" | "LOCATION";
  selected: boolean;
  onSelect: () => void;
}) {
  const disabled = option.status === "DISABLED";
  return (
    <button
      type="button"
      className={
        selected
          ? dcx("v2-meetup-option-row is-selected")
          : disabled
            ? dcx("v2-meetup-option-row is-disabled-option")
            : dcx("v2-meetup-option-row")
      }
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
    >
      <span className={dcx("v2-meetup-option-radio")} aria-hidden="true" />
      <span className={dcx("v2-meetup-option-icon")} aria-hidden="true">
        {kind === "TIME" ? <CalendarIcon /> : <MapPinIcon />}
      </span>
      <span className={dcx("v2-meetup-option-body")}>
        <strong>{optionPrimaryText(option)}</strong>
        <span>{optionSecondaryText(option)}</span>
      </span>
    </button>
  );
}

function FinalConfirmBody({
  session,
  currentUserId,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  const plan = session.currentPlan;

  const acceptMessage = findLatestMessageBy(
    session,
    (msg) => msg.type === "ACCEPT" && msg.actorUserId !== currentUserId,
  );
  const counterpartNote = acceptMessage?.noteText ?? null;

  return (
    <>
      {counterpartNote ? (
        <div className={dcx("v2-meetup-action-counterpart-note")}>
          <span className={dcx("v2-meetup-action-section-label")}>对方的备注</span>
          <p>{counterpartNote}</p>
        </div>
      ) : null}
      <ul className={dcx("v2-meetup-summary-list")}>
      <li>
        <span className={dcx("v2-meetup-summary-tag")}>时间</span>
        <span>
          <strong>{formatMeetupTimeRange(plan.startsAt, plan.endsAt)}</strong>
        </span>
      </li>
      <li>
        <span className={dcx("v2-meetup-summary-tag")}>地点</span>
        <span>
          <strong>{plan.placeName ?? "地点待确认"}</strong>
        </span>
      </li>
    </ul>
    </>
  );
}

function WaitingBody({
  session,
  currentUserId,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  const proposal = useMemo(
    () => findLatestMyProposal(session, currentUserId),
    [session, currentUserId],
  );

  if (!proposal) {
    return (
      <p className={dcx("v2-meetup-action-subtitle")}>
        当前没有可显示的方案摘要；可以下拉查看协商记录。
      </p>
    );
  }

  const timeOptions = proposal.options.filter((option) => option.kind === "TIME");
  const locationOptions = proposal.options.filter(
    (option) => option.kind === "LOCATION",
  );

  return (
    <ul className={dcx("v2-meetup-summary-list")}>
      {timeOptions.map((option, index) => (
        <li key={option.id}>
          <span className={dcx("v2-meetup-summary-tag")}>
            {timeOptions.length === 1 ? "时间" : `时间 ${index + 1}`}
          </span>
          <span>
            <strong>{optionPrimaryText(option)}</strong>
          </span>
        </li>
      ))}
      {locationOptions.map((option, index) => (
        <li key={option.id}>
          <span className={dcx("v2-meetup-summary-tag")}>
            {locationOptions.length === 1 ? "地点" : `地点 ${index + 1}`}
          </span>
          <span>
            <strong>{optionPrimaryText(option)}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}

function NeedsProposeBody({
  session,
  currentUserId,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  const counterpartProposal = useMemo(
    () => findLatestCounterpartProposal(session, currentUserId),
    [session, currentUserId],
  );

  // Surface the reason the counterpart rejected so the proposer doesn't
  // re-propose blindly. Only when the counterpart's most recent message is a
  // rejection — a later partial-accept must not resurface a stale REJECT note.
  const rejectNote = useMemo(() => {
    const message = findLatestMessageBy(
      session,
      (msg) => msg.actorUserId !== currentUserId,
    );
    return message?.type === "REJECT"
      ? (message.noteText ?? message.notePreset ?? null)
      : null;
  }, [session, currentUserId]);

  if (!counterpartProposal && !rejectNote) {
    return null;
  }

  const timeCount =
    counterpartProposal?.options.filter((o) => o.kind === "TIME").length ?? 0;
  const locationCount =
    counterpartProposal?.options.filter((o) => o.kind === "LOCATION").length ?? 0;

  return (
    <>
      {rejectNote ? (
        <div className={dcx("v2-meetup-action-counterpart-note")}>
          <span className={dcx("v2-meetup-action-section-label")}>对方的备注</span>
          <p>{rejectNote}</p>
        </div>
      ) : null}
      {counterpartProposal ? (
        <ul className={dcx("v2-meetup-summary-list")}>
          <li>
            <span className={dcx("v2-meetup-summary-tag")}>对方之前提议</span>
            <span>
              <strong>
                {[
                  timeCount > 0 ? `${timeCount} 个时间` : null,
                  locationCount > 0 ? `${locationCount} 个地点` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "已撤回方案"}
              </strong>
            </span>
          </li>
        </ul>
      ) : null}
    </>
  );
}

function LockedBody({ session }: { session: MeetupSessionResponse }) {
  const plan = session.currentPlan;
  return (
    <ul className={dcx("v2-meetup-summary-list")}>
      <li>
        <span className={dcx("v2-meetup-summary-tag")}>时间</span>
        <span>
          <strong>{formatMeetupTimeRange(plan.startsAt, plan.endsAt)}</strong>
        </span>
      </li>
      <li>
        <span className={dcx("v2-meetup-summary-tag")}>地点</span>
        <span>
          <strong>{plan.placeName ?? "地点待确认"}</strong>
        </span>
      </li>
      {session.lockedAt ? (
        <li>
          <span className={dcx("v2-meetup-summary-tag")}>确认于</span>
          <span>{formatMeetupShortDateTime(session.lockedAt)}</span>
        </li>
      ) : null}
    </ul>
  );
}
