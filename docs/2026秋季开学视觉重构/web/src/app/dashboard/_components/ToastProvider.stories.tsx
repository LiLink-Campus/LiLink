import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui";
import { expect } from "storybook/test";
import { ToastProvider, useToast } from "./ToastProvider";

function ToastTrigger({ message }: { message: string }) {
  const { showToast } = useToast();

  return <Button onClick={() => showToast(message)}>显示通知</Button>;
}

const meta = {
  title: "Dashboard/Foundation/ToastProvider",
  component: ToastProvider,
  tags: ["smoke"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ToastProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ToastAppears: Story = {
  args: {
    children: <ToastTrigger message="资料已保存" />,
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "显示通知" }));
    await expect(await canvas.findByText("资料已保存")).toBeVisible();
  },
};
