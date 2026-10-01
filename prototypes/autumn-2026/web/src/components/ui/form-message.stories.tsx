import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FormMessage } from "./index";

const meta = {
  title: "UI/Primitives/Form Message",
  component: FormMessage,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["error", "success"],
    },
  },
  args: {
    tone: "error",
    children: "请填写学校邮箱",
  },
} satisfies Meta<typeof FormMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Success: Story = {
  args: {
    tone: "success",
    children: "验证邮件已发送",
  },
};
