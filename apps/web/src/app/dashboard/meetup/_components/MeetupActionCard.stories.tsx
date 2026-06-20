import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";
import type {
  MeetupMessage,
  MeetupOption,
  MeetupSessionResponse,
} from "../../../../lib/api";
import { MeetupActionCard, resolveMeetupActionState } from "./MeetupActionCard";

const CURRENT_USER_ID = "user-a";
const COUNTERPART_ID = "user-b";

function timeOption(id: string, startsAt: string, endsAt: string): MeetupOption {
  return {
    id,
    kind: "TIME",
    status: "REJECTED",
    startsAt,
    endsAt,
    toleranceMinutes: 30,
    locationCandidateId: null,
    placeName: null,
    latitude: null,
    longitude: null,
  };
}

function locationOption(id: string, placeName: string): MeetupOption {
  return {
    id,
    kind: "LOCATION",
    status: "REJECTED",
    startsAt: null,
    endsAt: null,
    toleranceMinutes: null,
    locationCandidateId: null,
    placeName,
    latitude: null,
    longitude: null,
  };
}

function proposeMessage(
  id: string,
  actorUserId: string,
  createdAt: string,
  options: MeetupOption[],
): MeetupMessage {
  return {
    id,
    actorUserId,
    type: "PROPOSE",
    notePreset: null,
    noteText: null,
    createdAt,
    proposal: {
      id: `${id}-proposal`,
      actorUserId,
      scope: "BOTH",
      status: "REJECTED",
      options,
    },
  };
}

function rejectMessage(
  id: string,
  createdAt: string,
  note: { noteText?: string | null; notePreset?: string | null } = {},
): MeetupMessage {
  return {
    id,
    actorUserId: COUNTERPART_ID,
    type: "REJECT",
    notePreset: note.notePreset ?? null,
    noteText: note.noteText ?? null,
    createdAt,
    proposal: null,
  };
}

/**
 * Build an ACTIVE session where it is the current user's turn to (re)propose:
 * no pending proposal, `propose` enabled. The caller supplies the message log
 * so each story can model a specific rejection history.
 */
function buildNeedsProposeSession(
  messages: MeetupMessage[],
  overrides: Partial<MeetupSessionResponse> = {},
): MeetupSessionResponse {
  return {
    id: "meetup-session-story-088",
    matchId: "match-story-088",
    status: "ACTIVE",
    userTurnStatus: "NEEDS_YOUR_RESPONSE",
    progressStatus: "NEGOTIATING",
    startedByUserId: CURRENT_USER_ID,
    counterpartUserId: COUNTERPART_ID,
    counterpartDisplayName: "小柏",
    currentProposalId: null,
    confirmedTimeOptionId: null,
    confirmedLocationOptionId: null,
    finalConfirmRequiredByUserId: null,
    lockedAt: null,
    canceledAt: null,
    canceledByUserId: null,
    effectiveExpirationWeeks: 9,
    expiresAt: "2030-05-01T10:00:00.000Z",
    archiveEligibleAt: null,
    lastActiveAt: "2030-04-18T13:30:00.000Z",
    currentPlan: {
      timeOption: null,
      locationOption: null,
      startsAt: null,
      endsAt: null,
      toleranceMinutes: null,
      locationCandidateId: null,
      placeName: null,
      latitude: null,
      longitude: null,
    },
    currentPendingProposal: null,
    participants: [
      {
        userId: CURRENT_USER_ID,
        displayName: "我",
        turnState: "REQUIRED",
        revisionUsedAt: null,
        lastSeenAt: "2030-04-18T13:30:00.000Z",
      },
      {
        userId: COUNTERPART_ID,
        displayName: "小柏",
        turnState: "WAITING",
        revisionUsedAt: null,
        lastSeenAt: "2030-04-18T13:25:00.000Z",
      },
    ],
    messages,
    availableActions: {
      propose: { enabled: true, reason: null },
      accept: { enabled: false, reason: "NO_ACCEPTABLE_PENDING_PROPOSAL", requiredOptionKinds: [] },
      reject: { enabled: false, reason: "NO_REJECTABLE_PENDING_PROPOSAL" },
      finalConfirm: { enabled: false, reason: "FINAL_CONFIRM_NOT_REQUIRED" },
      reviseAfterLock: { enabled: false, reason: "SESSION_NOT_LOCKED" },
      cancel: { enabled: true, reason: null },
    },
    currentUserFeedback: null,
    canSubmitFeedback: false,
    feedbackEligibleAt: null,
    ...overrides,
  } satisfies MeetupSessionResponse;
}

function acceptMessage(id: string, createdAt: string): MeetupMessage {
  return {
    id,
    actorUserId: COUNTERPART_ID,
    type: "ACCEPT",
    notePreset: null,
    noteText: null,
    createdAt,
    proposal: null,
  };
}

const OLDER_REJECT_NOTE = "周末确实抽不开身，工作日的晚上对我更合适一些～";
const LATEST_REJECT_NOTE = "地点想约在南门那边方便吗？北门对我来说有点远。";

// Production scenario (issue #88): the proposer was rejected twice and it is now
// their turn to re-propose. The counterpart never made a proposal of their own.
const TWO_ROUND_REJECTION: MeetupMessage[] = [
  proposeMessage("m1", CURRENT_USER_ID, "2030-04-18T12:00:00.000Z", [
    timeOption("o1", "2030-04-20T03:00:00.000Z", "2030-04-20T05:00:00.000Z"),
    locationOption("o2", "北门咖啡"),
  ]),
  rejectMessage("m2", "2030-04-18T12:30:00.000Z", { noteText: OLDER_REJECT_NOTE }),
  proposeMessage("m3", CURRENT_USER_ID, "2030-04-18T13:00:00.000Z", [
    timeOption("o3", "2030-04-21T11:00:00.000Z", "2030-04-21T13:00:00.000Z"),
    locationOption("o4", "北门咖啡"),
  ]),
  rejectMessage("m4", "2030-04-18T13:30:00.000Z", { noteText: LATEST_REJECT_NOTE }),
];

// The counterpart had proposed earlier and their latest REJECT carried no note —
// the summary still renders, but no empty "对方的备注" block should appear.
const REJECT_WITHOUT_NOTE: MeetupMessage[] = [
  proposeMessage("m1", COUNTERPART_ID, "2030-04-18T12:00:00.000Z", [
    timeOption("o1", "2030-04-20T03:00:00.000Z", "2030-04-20T05:00:00.000Z"),
    locationOption("o2", "南门书店"),
  ]),
  proposeMessage("m2", CURRENT_USER_ID, "2030-04-18T12:30:00.000Z", [
    timeOption("o3", "2030-04-21T11:00:00.000Z", "2030-04-21T13:00:00.000Z"),
  ]),
  rejectMessage("m3", "2030-04-18T13:00:00.000Z"),
];

const STALE_REJECT_NOTE = "想换个离我近一点的地方，这个有点远～";

// The counterpart rejected an early round (with a note) but their most recent
// action is a partial accept (time confirmed, location still pending), which
// also lands the proposer back in `needsPropose`. The stale REJECT note must
// NOT resurface, since it no longer reflects the counterpart's latest stance.
const STALE_REJECT_AFTER_PARTIAL_ACCEPT: MeetupMessage[] = [
  proposeMessage("m1", CURRENT_USER_ID, "2030-04-18T12:00:00.000Z", [
    timeOption("o1", "2030-04-20T03:00:00.000Z", "2030-04-20T05:00:00.000Z"),
    locationOption("o2", "北门咖啡"),
  ]),
  rejectMessage("m2", "2030-04-18T12:30:00.000Z", { noteText: STALE_REJECT_NOTE }),
  proposeMessage("m3", CURRENT_USER_ID, "2030-04-18T13:00:00.000Z", [
    timeOption("o3", "2030-04-21T11:00:00.000Z", "2030-04-21T13:00:00.000Z"),
    locationOption("o4", "南门书店"),
  ]),
  acceptMessage("m4", "2030-04-18T13:30:00.000Z"),
];

function MeetupActionCardDemo({ session }: { session: MeetupSessionResponse }) {
  return (
    <MeetupActionCard
      session={session}
      currentUserId={CURRENT_USER_ID}
      selectedTimeId={null}
      selectedLocationId={null}
      noteText=""
      onSelectTime={fn()}
      onSelectLocation={fn()}
      onNoteChange={fn()}
      state={resolveMeetupActionState(session)}
    />
  );
}

const meta = {
  title: "Dashboard/Meetup/Components/MeetupActionCard",
  component: MeetupActionCardDemo,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/dashboard/meetup" },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(620px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MeetupActionCardDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * needsPropose with the counterpart's latest rejection note surfaced. Across two
 * rounds of rejection, only the most recent note is shown (issue #88).
 */
export const WithRejectNote: Story = {
  args: { session: buildNeedsProposeSession(TWO_ROUND_REJECTION) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("对方的备注")).toBeInTheDocument();
    await expect(canvas.getByText(LATEST_REJECT_NOTE)).toBeInTheDocument();
    // Only the latest rejection note is shown, not earlier rounds.
    await expect(canvas.queryByText(OLDER_REJECT_NOTE)).not.toBeInTheDocument();
  },
};

/**
 * needsPropose where the latest rejection carried no note: no empty "对方的备注"
 * block is rendered, while the counterpart's prior-proposal summary still shows.
 */
export const RejectWithoutNote: Story = {
  args: { session: buildNeedsProposeSession(REJECT_WITHOUT_NOTE) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("对方的备注")).not.toBeInTheDocument();
    await expect(canvas.getByText("对方之前提议")).toBeInTheDocument();
  },
};

/**
 * needsPropose reached via a partial accept (time confirmed, location pending)
 * after an earlier rejection. The stale earlier rejection note must not appear,
 * because the counterpart's latest action was not a rejection.
 */
export const StaleRejectNotSurfaced: Story = {
  args: {
    session: buildNeedsProposeSession(STALE_REJECT_AFTER_PARTIAL_ACCEPT, {
      confirmedTimeOptionId: "o3",
      progressStatus: "TIME_CONFIRMED_LOCATION_PENDING",
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("重新提议方案")).toBeInTheDocument();
    await expect(canvas.queryByText("对方的备注")).not.toBeInTheDocument();
    await expect(canvas.queryByText(STALE_REJECT_NOTE)).not.toBeInTheDocument();
  },
};
