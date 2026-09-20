import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import OneToOnePage from "./page";

const meta = {
  title: "Marketing/OneToOne",
  component: OneToOnePage,
  tags: ["smoke"],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof OneToOnePage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
export const StorySubmissionDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("故事如何投稿？返还如何申请？"));
    await expect(canvas.getByText(/投稿使用网名，公开内容须经双方确认/)).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "免费登记" })).toBeInTheDocument();
  },
};
