import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import DashboardError from "./error";

const meta = {
  title: "Dashboard/ServiceError",
  component: DashboardError,
  tags: ["smoke"],
  args: { reset: fn() },
  parameters: { layout: "padded" },
  decorators: [(Story) => <main style={{ maxWidth: 720, margin: "32px auto" }}><Story /></main>],
} satisfies Meta<typeof DashboardError>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Recoverable: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "暂时无法加载" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "重新加载" }));
    await expect(args.reset).toHaveBeenCalled();
  },
};
