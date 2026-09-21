import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { useState } from "react";
import { getInstallState, INSTALL_READY_WAIT_MS, type InstallEvent } from "../../lib/pwa-install-state";
import { PwaInstallProvider, PwaInstallEntry, PwaInstallCard } from "./PwaInstall";

const meta = {
  title: "PWA/Install",
  tags: ["smoke"],
  component: PwaInstallProvider,
  args: { children: null },
  beforeEach: () => {
    localStorage.removeItem("lilink-install-dismissed");
    Object.assign(getInstallState(), { event: null, installed: false, prompting: false });
  },
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
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "知道了" })).toBeVisible(), { timeout: INSTALL_READY_WAIT_MS + 1500 });
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

function installEvent(prompt: () => Promise<unknown>, outcome: "accepted" | "dismissed" = "accepted") {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  }) as InstallEvent;
}

export const DelayedInstallReady: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click((await c.findAllByRole("button", { name: /添加到桌面/ }))[0]);
    const d = within(await within(document.body).findByRole("dialog"));
    await expect(d.getByRole("heading", { name: "正在准备安装" })).toBeVisible();
    let calls = 0;
    window.dispatchEvent(installEvent(async () => { calls++; }));
    const install = await d.findByRole("button", { name: "立即安装" });
    await expect(calls).toBe(0);
    await userEvent.click(install);
    await expect(calls).toBe(1);
    await waitFor(() => expect(c.queryByRole("complementary")).toBeNull());
  },
};

export const GuideBecomesInstall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click((await c.findAllByRole("button", { name: /添加到桌面/ }))[0]);
    const d = within(await within(document.body).findByRole("dialog"));
    await waitFor(() => expect(d.getByText("在浏览器菜单中查找安装入口")).toBeVisible(), { timeout: INSTALL_READY_WAIT_MS + 1500 });
    let calls = 0;
    window.dispatchEvent(installEvent(async () => { calls++; }));
    await expect(await d.findByRole("button", { name: "立即安装" })).toBeVisible();
    await expect(calls).toBe(0);
    await expect(d.queryByText("在浏览器菜单中查找安装入口")).toBeNull();
  },
};

export const CancelThenInstall: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const entry = (await c.findAllByRole("button", { name: /添加到桌面/ }))[0];
    let cancelledCalls = 0;
    window.dispatchEvent(installEvent(async () => { cancelledCalls++; }, "dismissed"));
    await userEvent.click(entry);
    const d = within(await within(document.body).findByRole("dialog"));
    await expect(d.getByRole("heading", { name: "已取消安装" })).toBeVisible();
    await expect(localStorage.getItem("lilink-install-dismissed")).toBeNull();
    await userEvent.click(d.getByRole("button", { name: "重新尝试安装" }));
    await expect(cancelledCalls).toBe(1);
    let nextCalls = 0;
    window.dispatchEvent(installEvent(async () => { nextCalls++; }));
    await userEvent.click(await d.findByRole("button", { name: "立即安装" }));
    await expect(nextCalls).toBe(1);
    await waitFor(() => expect(c.queryByRole("complementary")).toBeNull());
  },
};

export const PromptFailureCanRecover: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const entry = (await c.findAllByRole("button", { name: /添加到桌面/ }))[0];
    window.dispatchEvent(installEvent(async () => { throw new Error("Unavailable install UI"); }));
    await userEvent.click(entry);
    const d = within(await within(document.body).findByRole("dialog"));
    await expect(d.getByText("在浏览器菜单中查找安装入口")).toBeVisible();
    window.dispatchEvent(installEvent(async () => {}));
    await userEvent.click(await d.findByRole("button", { name: "立即安装" }));
    await waitFor(() => expect(c.queryByRole("complementary")).toBeNull());
  },
};

export const PreventDuplicatePrompt: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const buttons = await c.findAllByRole("button", { name: /添加到桌面/ });
    let finish!: () => void;
    let calls = 0;
    window.dispatchEvent(installEvent(() => { calls++; return new Promise<void>((resolve) => { finish = resolve; }); }));
    await userEvent.click(buttons[0]);
    await expect(buttons[0]).toBeDisabled();
    await expect(buttons[1]).toBeDisabled();
    await userEvent.click(buttons[1]);
    await expect(calls).toBe(1);
    finish();
    await waitFor(() => expect(c.queryByRole("complementary")).toBeNull());
  },
};

function RemountFixture() {
  const [key, setKey] = useState(0);
  return <><button onClick={() => setKey((value) => value + 1)}>重新打开页面</button><PwaInstallProvider key={key}><PwaInstallEntry /><PwaInstallCard /></PwaInstallProvider></>;
}

export const RetainAcrossRemount: Story = {
  render: () => <RemountFixture />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await c.findByRole("complementary");
    let calls = 0;
    window.dispatchEvent(installEvent(async () => { calls++; }));
    await userEvent.click(c.getByRole("button", { name: "重新打开页面" }));
    await userEvent.click((await c.findAllByRole("button", { name: /添加到桌面/ }))[0]);
    await expect(calls).toBe(1);
    await waitFor(() => expect(c.queryByRole("complementary")).toBeNull());
  },
};

function withUserAgent(userAgent: string) {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "userAgent");
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
  return () => {
    if (descriptor) Object.defineProperty(navigator, "userAgent", descriptor);
    else Reflect.deleteProperty(navigator, "userAgent");
  };
}

export const IPhoneGuide: Story = {
  beforeEach: () => withUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click((await c.findAllByRole("button", { name: /添加到桌面/ }))[0]);
    const d = within(await within(document.body).findByRole("dialog"));
    await expect(d.getByRole("heading", { name: "添加到主屏幕" })).toBeVisible();
    await expect(d.getByText("点击浏览器的分享按钮")).toBeVisible();
    await expect(d.queryByText("正在等待浏览器，准备好后即可安装。")).toBeNull();
  },
};

export const EmbeddedGuide: Story = {
  beforeEach: () => withUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 MicroMessenger/8.0"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click((await c.findAllByRole("button", { name: /添加到桌面/ }))[0]);
    const d = within(await within(document.body).findByRole("dialog"));
    await expect(d.getByText("请先在系统浏览器中打开 LiLink")).toBeVisible();
  },
};
