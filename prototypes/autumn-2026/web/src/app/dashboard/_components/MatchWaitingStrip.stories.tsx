import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MatchWaitingStrip, type MatchWaitingAction } from "./MatchWaitingStrip";

type ActionsMode = "both" | "primary" | "none";

type MatchWaitingStripDemoArgs = {
  title: string;
  subtitle: string;
  eyebrow: string;
  variant: "waiting" | "muted";
  revealLabel: string;
  revealAt: string;
  showReveal: boolean;
  actionsMode: ActionsMode;
};

function actionsForMode(mode: ActionsMode): MatchWaitingAction[] {
  if (mode === "none") {
    return [];
  }

  return [
    { label: "完善资料", href: "/dashboard/profile", variant: "primary" },
    ...(mode === "both"
      ? [
          {
            label: "查看历史",
            href: "/dashboard/match/history",
            variant: "secondary" as const,
          },
        ]
      : []),
  ];
}

function MatchWaitingStripDemo({
  actionsMode,
  showReveal,
  ...args
}: MatchWaitingStripDemoArgs) {
  return (
    <MatchWaitingStrip
      {...args}
      revealAt={showReveal ? args.revealAt : null}
      revealLabel={showReveal ? args.revealLabel : null}
      actions={actionsForMode(actionsMode)}
    />
  );
}

const meta = {
  title: "Dashboard/Match/Components/MatchWaitingStrip",
  component: MatchWaitingStripDemo,
  tags: ["smoke"],
  parameters: {
    fixedNow: "2030-04-10T12:00:00+08:00",
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
    variant: {
      control: "inline-radio",
      options: ["waiting", "muted"],
    },
    showReveal: {
      control: "boolean",
    },
    actionsMode: {
      control: "inline-radio",
      options: ["both", "primary", "none"],
    },
  },
  args: {
    title: "本周匹配等待中",
    subtitle: "你已经加入本周匹配，揭晓前可以继续完善资料。",
    eyebrow: "等待揭晓",
    variant: "waiting",
    revealLabel: "周五 20:00",
    revealAt: "2030-04-12T12:00:00.000Z",
    showReveal: true,
    actionsMode: "both",
  },
} satisfies Meta<typeof MatchWaitingStripDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const MutedNoActions: Story = {
  args: {
    title: "暂无可操作事项",
    subtitle: "本轮结果已经结束，可以查看历史记录。",
    eyebrow: "已结束",
    variant: "muted",
    showReveal: false,
    actionsMode: "none",
  },
};

export const WaitingLetter: Story = {
  args: {
    title: "等待本轮揭晓",
    subtitle: "你已报名本轮匹配。结果公布后可在这里查看；匹配成功时，双方会收到邮件。",
    actionsMode: "primary",
  },
};

export const UnmatchedLetter: Story = {
  args: {
    title: "本轮未匹配到对象",
    subtitle: "本轮暂未找到合适的同学。你可以检查匹配资料，下一轮开放后回到首页重新报名。",
    eyebrow: "未匹配",
    variant: "muted",
    showReveal: false,
    actionsMode: "primary",
  },
};
