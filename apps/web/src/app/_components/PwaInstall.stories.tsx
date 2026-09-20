import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { PwaInstallProvider, PwaInstallEntry, PwaInstallCard } from "./PwaInstall";

const meta = {
  title: "PWA/Install",
  tags: ["smoke"],
  component: PwaInstallProvider,
  args: { children: null },
  beforeEach: () => { localStorage.removeItem("lilink-install-dismissed"); },
  render: () => <PwaInstallProvider><div style={{ maxWidth: 420, padding: 20 }}><PwaInstallEntry /><PwaInstallCard /></div></PwaInstallProvider>,
} satisfies Meta<typeof PwaInstallProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guide: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const buttons = await c.findAllByRole("button", { name: /添加到桌面/ });
    await userEvent.click(buttons[0]);
    const dialog = await within(document.body).findByRole("dialog");
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "知道了" }));
    await expect(dialog).not.toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "暂时不用" }));
    await expect(c.queryByRole("complementary")).toBeNull();
    await expect(Number(localStorage.getItem("lilink-install-dismissed"))).toBeGreaterThan(Date.now() - 10000);
  },
};
export const NativeInstall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await c.findByRole("complementary");
    let prompted = false;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => { prompted = true; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
    await userEvent.click(c.getAllByRole("button", { name: /添加到桌面/ })[0]);
    await waitFor(() => expect(c.queryByRole("complementary")).toBeNull());
    await expect(prompted).toBe(true);
    await expect(event.defaultPrevented).toBe(true);
  },
};
