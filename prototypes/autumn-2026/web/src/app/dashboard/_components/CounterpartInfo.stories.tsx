import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CounterpartInfo } from "./CounterpartInfo";

const meta = {
  title: "Dashboard/Match/Components/CounterpartInfo",
  component: CounterpartInfo,
  tags: ["smoke"],
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

export const Playground: Story = {};

export const LongValues: Story = {
  args: {
    gender: "非二元 / 更愿意见面后介绍",
    partnerGenders: ["女生", "男生", "非二元"],
    weeklyIntent: "BOTH",
    compact: true,
  },
};

export const EmptyFields: Story = {
  args: {
    gender: null,
    partnerGenders: [],
    weeklyIntent: null,
  },
};
