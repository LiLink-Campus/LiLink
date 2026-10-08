import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Field, Input } from "./index";

const meta = {
  tags: ["!test"],
  title: "UI/Primitives/Form Controls",
  component: Input,
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
  tags: ["test"],
  args: { defaultValue: "chen-yinuo-campus-exhibition-weekend-cooking-2029" },
  render: (args) => <Field label="联系方式" hint="用于验证长联系方式输入"><Input {...args} /></Field>,
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("textbox", { name: "联系方式 用于验证长联系方式输入" })).toBeVisible();
    await expect(canvas.getByRole("textbox")).toHaveValue("chen-yinuo-campus-exhibition-weekend-cooking-2029");
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
