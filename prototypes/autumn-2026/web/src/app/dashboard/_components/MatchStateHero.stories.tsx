import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MatchStateHero, type MatchStateHeroProps } from "./MatchStateHero";

const extraChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-muted)",
  color: "var(--color-text-secondary)",
  padding: "0.28rem 0.65rem",
  fontSize: "0.78rem",
  fontWeight: 600,
} satisfies CSSProperties;

type ActionState = "ready" | "loading" | "disabled" | "hidden";

type MatchStateHeroDemoArgs = Omit<
  MatchStateHeroProps,
  "actions" | "body" | "children" | "contactLine"
> & {
  actionState: ActionState;
  body: string;
  contactLine: string;
  longText: boolean;
  secondaryAction: boolean;
  showExtra: boolean;
};

function MatchStateHeroDemo({
  actionState,
  body,
  contactLine,
  longText,
  secondaryAction,
  showExtra,
  ...props
}: MatchStateHeroDemoArgs) {
  const actionLabel =
    props.variant === "matched" ? "申请交换联系方式" : "完善资料";
  const actions =
    actionState === "hidden"
      ? undefined
      : [
          {
            label: actionLabel,
            onClick: () => undefined,
            loading: actionState === "loading",
            disabled: actionState === "disabled",
          },
          ...(secondaryAction
            ? [
                {
                  label: "查看历史",
                  href: "/dashboard/match/history",
                  variant: "secondary" as const,
                },
              ]
            : []),
        ];
  const longBody =
    "这里放一段偏长的中文说明，用来检查移动端小宽度下的换行、主按钮位置和卡片高度是否稳定。";

  return (
    <MatchStateHero
      {...props}
      actions={actions}
      body={longText ? `${body}${longBody}` : body}
      contactLine={props.variant === "matched" ? contactLine : undefined}
    >
      {showExtra ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span style={extraChipStyle}>同校区</span>
          <span style={extraChipStyle}>本周都想见面</span>
        </div>
      ) : null}
    </MatchStateHero>
  );
}

const meta = {
  title: "Dashboard/Match/Components/MatchStateHero",
  component: MatchStateHeroDemo,
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
      <div
        style={{
          width: "min(620px, calc(100vw - 32px))",
          background: "var(--color-canvas)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["matched", "empty", "limited", "waiting"],
    },
    score: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
    actionState: {
      control: "inline-radio",
      options: ["ready", "loading", "disabled", "hidden"],
    },
    longText: {
      control: "boolean",
    },
    secondaryAction: {
      control: "boolean",
    },
    showExtra: {
      control: "boolean",
    },
  },
  args: {
    variant: "matched",
    avatarInitial: "陈",
    title: "陈一诺同学",
    subtitle: "North Campus International Residential College",
    score: 92,
    body: "你们都选择了轻松见面，也都提到周末喜欢看展和散步。",
    contactLine: "微信号 chen-yinuo-campus-exhibition-weekend-cooking-2029",
    actionState: "ready",
    longText: false,
    secondaryAction: true,
    showExtra: true,
  },
} satisfies Meta<typeof MatchStateHeroDemo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Waiting: Story = {
  args: {
    variant: "waiting",
    title: "本周匹配等待中",
    subtitle: "下一轮揭晓前可以继续完善资料。",
    score: null,
    body: "系统会在揭晓时间后生成新的匹配结果。",
    actionState: "ready",
    secondaryAction: false,
    showExtra: false,
  },
};

export const Limited: Story = {
  args: {
    variant: "limited",
    title: "本轮匹配暂时不可见",
    subtitle: "该结果已进入处理流程。",
    score: 85,
    body: "为了保护双方体验，这部分信息暂时收起。",
    actionState: "disabled",
    secondaryAction: false,
    showExtra: false,
  },
};
