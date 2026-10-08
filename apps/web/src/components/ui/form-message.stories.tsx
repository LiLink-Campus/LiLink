import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FormMessage } from "./index";

const meta = {
  tags: ["!test"],
  title: "UI/Primitives/Form Message",
  component: FormMessage,
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

export const Gallery: Story = {
  render: () => <><FormMessage tone="error">请填写学校邮箱</FormMessage><FormMessage tone="success">验证邮件已发送</FormMessage></>,
};
