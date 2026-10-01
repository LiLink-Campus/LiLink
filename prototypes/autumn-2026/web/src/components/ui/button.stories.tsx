import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Button, ButtonLink } from "./index";

const meta = {
  title: "UI/Primitives/Button",
  component: Button,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"],
    },
    shape: {
      control: "inline-radio",
      options: ["pill", "rounded"],
    },
    elevation: {
      control: "inline-radio",
      options: ["raised", "flat"],
    },
    block: {
      control: "boolean",
    },
    disabled: {
      control: "boolean",
    },
  },
  args: {
    children: "开始匹配",
    variant: "primary",
    size: "md",
    shape: "pill",
    elevation: "raised",
    block: false,
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(140px, 1fr))",
        gap: "12px",
        width: "min(420px, calc(100vw - 32px))",
      }}
    >
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
      <Button variant="primary" elevation="flat">Flat</Button>
    </div>
  ),
};

export const AsLink: Story = {
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <ButtonLink href="/dashboard" variant="secondary">
      查看仪表盘
    </ButtonLink>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "查看仪表盘" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  },
};
