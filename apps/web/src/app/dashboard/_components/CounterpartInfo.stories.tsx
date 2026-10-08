import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CounterpartInfo } from "./CounterpartInfo";

const meta = {
  tags: ["!test"],
  title: "Dashboard/Match/Components/CounterpartInfo",
  component: CounterpartInfo,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(420px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    gender: {
      control: "text",
    },
    partnerGenders: {
      control: "object",
    },
    weeklyIntent: {
      control: "inline-radio",
      options: ["FRIEND", "DATE", "BOTH", null],
    },
    compact: {
      control: "boolean",
    },
  },
  args: {
    gender: "男生",
    partnerGenders: ["女生"],
    weeklyIntent: "DATE",
    compact: false,
  },
} satisfies Meta<typeof CounterpartInfo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: () => <div style={{ display: "grid", gap: 16 }}>
    <CounterpartInfo gender="男生" partnerGenders={["女生"]} weeklyIntent="DATE" />
    <CounterpartInfo gender="非二元 / 更愿意见面后介绍" partnerGenders={["女生", "男生", "非二元"]} weeklyIntent="BOTH" compact />
    <CounterpartInfo gender={null} partnerGenders={[]} weeklyIntent={null} />
  </div>,
};
