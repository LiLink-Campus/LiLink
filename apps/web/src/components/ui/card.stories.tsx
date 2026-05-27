import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card } from "./index";

const meta = {
  title: "UI/Primitives/Card",
  component: Card,
  tags: ["smoke"],
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

export const Playground: Story = {
  render: (args) => (
    <Card {...args}>
      <h3 style={{ margin: 0, fontSize: "1rem" }}>资料完整度</h3>
      <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
        用于承载一组紧密相关的信息或操作，不作为页面大区块装饰。
      </p>
    </Card>
  ),
};

export const Flush: Story = {
  args: {
    padding: "flush",
    layout: "plain",
  },
  render: (args) => (
    <Card {...args}>
      <div style={{ padding: "16px", borderBottom: "1px solid var(--color-border)" }}>
        紧凑列表头部
      </div>
      <div style={{ padding: "16px" }}>列表内容</div>
    </Card>
  ),
};
