import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type {
  DashboardMeetupSummary,
  DashboardTask,
} from "../_lib/types";
import { MeetupStatusRibbon } from "./MeetupStatusRibbon";

type MeetupStatus = DashboardMeetupSummary["status"];
type ProgressStatus = DashboardMeetupSummary["progressStatus"];
type TurnStatus = DashboardTask["userTurnStatus"];

type MeetupStatusRibbonDemoArgs = {
  status: MeetupStatus;
  progressStatus: ProgressStatus;
  turnStatus: TurnStatus;
  taskText: string;
  showTask: boolean;
};

function MeetupStatusRibbonDemo({
  progressStatus,
  showTask,
  status,
  taskText,
  turnStatus,
}: MeetupStatusRibbonDemoArgs) {
  const summary = {
    sessionId: "meetup-session-story-001",
    matchId: "match-story-001",
    status,
    progressStatus,
    href: "/dashboard/meetup/meetup-session-story-001",
    confirmedStartsAt: status === "LOCKED" ? "2030-04-18T11:00:00.000Z" : null,
    confirmedEndsAt: status === "LOCKED" ? "2030-04-18T13:00:00.000Z" : null,
    confirmedPlaceName: status === "LOCKED" ? "湖边咖啡" : null,
    canReviseAfterLock: status === "LOCKED",
    canCancel: status === "ACTIVE",
    terminalText: null,
    currentUserFeedback: null,
    canSubmitFeedback: false,
    feedbackEligibleAt: status === "LOCKED" ? "2030-04-18T11:00:00.000Z" : null,
  } satisfies DashboardMeetupSummary;
  const task = showTask
    ? ({
        id: "task-meetup-story-001",
        type: "MEETUP",
        priority: 10,
        title: "推进第一次见面安排",
        text: taskText,
        href: summary.href,
        userTurnStatus: turnStatus,
        progressStatus,
        matchId: summary.matchId,
        sessionId: summary.sessionId,
        updatedAt: "2030-04-12T10:00:00.000Z",
      } satisfies DashboardTask)
    : null;

  return <MeetupStatusRibbon summary={summary} task={task} />;
}

const meta = {
  title: "Dashboard/Match/Components/MeetupStatusRibbon",
  component: MeetupStatusRibbonDemo,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/dashboard/match",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(620px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    status: {
      control: "select",
      options: ["ACTIVE", "LOCKED", "CANCELED", "EXPIRED", "ARCHIVED"],
    },
    progressStatus: {
      control: "select",
      options: [
        "NOT_STARTED",
        "NEGOTIATING",
        "LOCATION_CONFIRMED_TIME_PENDING",
        "TIME_CONFIRMED_LOCATION_PENDING",
        "AWAITING_FINAL_CONFIRMATION",
        "LOCKED",
        "CANCELED",
        "EXPIRED",
        "ARCHIVED",
      ],
    },
    turnStatus: {
      control: "inline-radio",
      options: [
        "NOT_STARTED",
        "WAITING_FOR_COUNTERPART",
        "NEEDS_YOUR_RESPONSE",
        "NONE",
      ],
    },
    showTask: {
      control: "boolean",
    },
  },
  args: {
    status: "ACTIVE",
    progressStatus: "NEGOTIATING",
    turnStatus: "NEEDS_YOUR_RESPONSE",
    taskText: "选择一个你可行的时间，或补充新的地点建议。",
    showTask: true,
  },
} satisfies Meta<typeof MeetupStatusRibbonDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Locked: Story = {
  args: {
    status: "LOCKED",
    progressStatus: "LOCKED",
    turnStatus: "NONE",
    taskText: "时间和地点已经确认。",
  },
};

export const WaitingForCounterpart: Story = {
  args: {
    turnStatus: "WAITING_FOR_COUNTERPART",
    taskText: "已提交你的可行选项，等待对方确认。",
  },
};
