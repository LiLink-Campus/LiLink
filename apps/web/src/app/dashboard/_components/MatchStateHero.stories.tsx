import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MatchStateHero } from "./MatchStateHero";

const meta = {
  title: "Dashboard/Match/Components/MatchStateHero",
  component: MatchStateHero,
  tags: ["!test"],
  parameters: { layout: "centered" },
  args: {
    variant: "matched",
    avatarInitial: "陈",
    title: "陈一诺同学",
    subtitle: "North Campus International Residential College",
    score: 92,
    body: "周末一起看展和散步，慢慢了解彼此。",
    contactLine: "微信号 chen-yinuo-campus-exhibition-weekend-cooking-2029",
    actions: [{ label: "查看历史", href: "/dashboard/match/history", variant: "secondary" }],
  },
} satisfies Meta<typeof MatchStateHero>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: (args) => <div style={{ display: "grid", gap: 16, width: "min(620px, calc(100vw - 32px))" }}>
    <MatchStateHero {...args} />
    <MatchStateHero variant="waiting" title="本周匹配等待中" subtitle="下一轮揭晓前可以继续完善资料。" score={null} body="系统会在揭晓时间后生成新的匹配结果。" />
    <MatchStateHero variant="limited" title="本轮匹配暂时不可见" subtitle="该结果已进入处理流程。" score={85} body="为了保护双方体验，这部分信息暂时收起。" />
  </div>,
};
