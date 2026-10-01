import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Field, Input } from "./index";

const meta = {
  title: "UI/Primitives/Form Controls",
  component: Input,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    controlSize: {
      control: "inline-radio",
      options: ["md", "lg"],
    },
    radius: {
      control: "inline-radio",
      options: ["md", "sm"],
    },
    border: {
      control: "inline-radio",
      options: ["strong", "subtle"],
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    controlSize: "md",
    radius: "md",
    border: "strong",
    disabled: false,
    placeholder: "student@example.edu",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(360px, calc(100vw - 32px))" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InputField: Story = {
  render: (args) => (
    <Field label="学校邮箱" hint="用于验证你的高校身份">
      <Input {...args} type="email" />
    </Field>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox")).toBeVisible();
  },
};

export const LongValue: Story = {
  args: {
    defaultValue: "chen-yinuo-campus-exhibition-weekend-cooking-2029",
  },
  render: (args) => (
    <Field label="联系方式" hint="移动端用于检查长联系方式输入状态">
      <Input {...args} />
    </Field>
  ),
};
