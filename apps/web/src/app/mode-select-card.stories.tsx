import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import {
  CoffeeCupsIllustration,
  ThreeChairsIllustration,
} from "./dashboard/_components/illustrations";
import { ModeSelectCard } from "./mode-select-card";

const meta = {
  title: "App Entry/ModeSelectCard",
  component: ModeSelectCard,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(640px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModeSelectCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ActiveMatching: Story = {
  args: {
    title: "1v1 匹配",
    tagline: "每周一位新同学，轻松慢相处。",
    status: { label: "进行中", tone: "active" },
    illustration: <CoffeeCupsIllustration />,
    footerLine: (
      <>
        当前已有 <strong>128+</strong> 位同学加入本周
      </>
    ),
    cta: { href: "/dashboard", label: "开始匹配 →" },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "开始匹配 →" }),
    ).toHaveAttribute("href", "/dashboard");
  },
};

export const UpcomingGroupMode: Story = {
  args: {
    title: "多人局",
    tagline: "多人匹配，更多可能。",
    status: { label: "即将开放", tone: "upcoming" },
    illustration: <ThreeChairsIllustration />,
    footerLine: "多人组队的匹配算法正在打磨",
    disabledCtaLabel: "即将开放",
  },
};
