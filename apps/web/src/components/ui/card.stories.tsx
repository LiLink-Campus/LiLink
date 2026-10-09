import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "./index";

const meta = {
  tags: ["!test"],
  title: "UI/Primitives/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    padding: {
      control: "select",
      options: ["compact", "md", "spacious", "flush"],
    },
    layout: {
      control: "inline-radio",
      options: ["stack", "plain"],
    },
    elevation: {
      control: "inline-radio",
      options: ["sm", "md"],
    },
  },
  args: {
    padding: "md",
    layout: "stack",
    elevation: "sm",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(420px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: () => <div style={{ display: "grid", gap: 16 }}>
    <Card padding="md" layout="stack"><h3>资料完整度</h3><p>一组紧密相关的信息与操作。</p></Card>
    <Card padding="flush" layout="plain"><div style={{ padding: 16 }}>紧凑列表</div></Card>
  </div>,
};
