import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import { HomeOverview } from "./HomeOverview";
import appShellStyles from "./AppShell.module.css";
import { resolveAgenda } from "../_lib/agenda";
import { matchDashboardFixtures } from "../match/match.fixtures";

function makeAgenda(optedIn: boolean, eligible = true) {
  return resolveAgenda({
    dashboard: {
      ...matchDashboardFixtures.introducedContactCompleted,
      currentCycle: {
        ...matchDashboardFixtures.introducedContactCompleted.currentCycle!,
        participationStatus: optedIn ? "OPTED_IN" : "OPTED_OUT",
        intent: optedIn ? "DATE" : null,
      },
    },
    nowMs: new Date("2030-04-09T12:00:00Z").getTime(),
    contactPreferences: {
      revision: 0,
      email: "student@example.com",
      preferredContactChannel: "EMAIL",
      methods: [],
    },
    counterpartDisplayName: "陈一诺",
    questionnaire: {
      percent: 100,

      submitted: true,
      missingOneLinerIntro: false,
      eligibleToOptIn: eligible,
      attention: null,
    },
  });
}

const meta = {
  tags: ["!test"],
  title: "Dashboard/Home/Overview",
  component: HomeOverview,
  decorators: [(Story) => <main className={appShellStyles.main}><Story /></main>],
  parameters: {
    layout: "fullscreen",
    fixedNow: "2030-04-09T12:00:00Z",
    nextjs: { appDirectory: true, navigation: { pathname: "/dashboard" } },
  },
  args: {
    name: "林和",
    counterpartName: "陈一诺",
    agenda: makeAgenda(false),
    hasCycle: true,
    optedIn: false,
    canEdit: true,
    eligible: true,
    intent: null,
    saving: false,
    onAction: () => {},
  },
} satisfies Meta<typeof HomeOverview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CarouselControlsAndSwipe: Story = {
  tags: ["test"],
  name: "轮播 / 手机点击与滑动",
  globals: { viewport: { value: "mobile407" } },
  play: async ({ canvas, userEvent }) => {
    const carousel = canvas.getByRole("complementary", { name: "活动轮播" });
    const controls = within(carousel);
    const first = controls.getByRole("button", { name: "切换到LiLink 1v1 · 专人服务" });
    const second = controls.getByRole("button", { name: "切换到商家合作 · 筹备中" });
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(second);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(document.getElementById(first.getAttribute("aria-controls")!)).toHaveAttribute("inert");
    await expect(controls.getByRole("button", { name: "查看活动说明 ↗" })).toBeVisible();
    await userEvent.click(first);
    const swipe = async (endX: number, endY: number, cancel = false) => {
      const start = new Touch({ identifier: 1, target: carousel, clientX: 300, clientY: 200 });
      const end = new Touch({ identifier: 1, target: carousel, clientX: endX, clientY: endY });
      await fireEvent.touchStart(carousel, { touches: [start], changedTouches: [start] });
      if (cancel) await fireEvent.touchCancel(carousel, { touches: [], changedTouches: [end] });
      await fireEvent.touchEnd(carousel, { touches: [], changedTouches: [end] });
    };
    await swipe(100, 205);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await swipe(230, 380);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await swipe(100, 205, true);
    await expect(second).toHaveAttribute("aria-pressed", "true");
  },
};

let intervalClock: typeof import("vitest")["vi"] | undefined;
async function controlIntervals() {
  // Development previews keep real timers; the Vitest browser owns its fake clock.
  if (!("__vitest_browser__" in globalThis)) return;
  intervalClock = (await import("vitest")).vi;
  intervalClock.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  return () => { intervalClock?.useRealTimers(); intervalClock = undefined; };
}
async function advanceIntervals(ms: number) {
  if (intervalClock) await intervalClock.advanceTimersByTimeAsync(ms);
  else await new Promise(resolve => setTimeout(resolve, ms));
}

export const CarouselAutoplay: Story = {
  tags: ["test"],
  beforeEach: controlIntervals,
  name: "轮播 / 五秒自动播放与悬停暂停",
  globals: { viewport: { value: "desktop1280" } },
  play: async ({ canvas, userEvent }) => {
    const carousel = canvas.getByRole("complementary", { name: "活动轮播" });
    const first = within(carousel).getByRole("button", { name: "切换到LiLink 1v1 · 专人服务" });
    const second = within(carousel).getByRole("button", { name: "切换到商家合作 · 筹备中" });
    await advanceIntervals(4999);
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await advanceIntervals(1);
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"));
    await userEvent.hover(carousel);
    await advanceIntervals(5500);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.unhover(carousel);
    await advanceIntervals(5000);
    await waitFor(() => expect(first).toHaveAttribute("aria-pressed", "true"));
  },
};

export const CarouselFocusAndDialogPause: Story = {
  tags: ["test"],
  beforeEach: controlIntervals,
  name: "轮播 / 焦点与活动弹窗暂停",
  play: async ({ canvas, userEvent }) => {
    const carousel = canvas.getByRole("complementary", { name: "活动轮播" });
    const second = within(carousel).getByRole("button", { name: "切换到商家合作 · 筹备中" });
    await userEvent.click(second);
    await userEvent.unhover(carousel);
    await advanceIntervals(5500);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(carousel).getByRole("button", { name: "查看活动说明 ↗" }));
    await userEvent.unhover(carousel);
    await expect(canvas.getByRole("dialog", { name: "商家合作活动" })).toBeVisible();
    await expect(
      canvas.getByText("商家合作活动正在筹备，开放后会公布活动时间、优惠内容和参与方式。")
    ).toBeVisible();
    await advanceIntervals(5500);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "知道了" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const CarouselParentPause: Story = {
  tags: ["test"],
  name: "轮播 / 报名弹窗暂停、恢复与卸载",
  beforeEach: controlIntervals,
  render: (args) => <PauseFixture {...args} />,
  play: async ({ canvas, userEvent }) => {
    const first = canvas.getByRole("button", { name: "切换到LiLink 1v1 · 专人服务" });
    await advanceIntervals(5500);
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "恢复轮播" }));
    await advanceIntervals(5000);
    await waitFor(() => expect(canvas.getByRole("button", { name: "切换到商家合作 · 筹备中" })).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(canvas.getByRole("button", { name: "卸载轮播" }));
    await expect(canvas.queryByRole("complementary", { name: "活动轮播" })).not.toBeInTheDocument();
    if (intervalClock) await expect(intervalClock.getTimerCount()).toBe(0);
  },
};

export const AgendaGallery: Story = {
  render: (args) => <div style={{ display: "grid", gap: 24 }}>
    <HomeOverview {...args} />
    <HomeOverview {...args} optedIn intent="DATE" agenda={makeAgenda(true)} />
    <HomeOverview {...args} optedIn intent="DATE" agenda={makeAgenda(true)} canEdit={false} />
    <HomeOverview {...args} hasCycle={false} canEdit={false} />
    <HomeOverview {...args} eligible={false} agenda={makeAgenda(false, false)} />
  </div>,
};

function PauseFixture(args: React.ComponentProps<typeof HomeOverview>) {
  const [paused, setPaused] = useState(true);
  const [mounted, setMounted] = useState(true);
  return <><button onClick={() => setPaused(false)}>恢复轮播</button><button onClick={() => setMounted(false)}>卸载轮播</button>{mounted && <HomeOverview {...args} activitiesPaused={paused} />}</>;
}
