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
  title: "Dashboard/Home/Overview",
  component: HomeOverview,
  decorators: [(Story) => <main className={appShellStyles.main}><Story /></main>],
  tags: ["smoke"],
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

export const NextCycleNeedsSignup: Story = {};
export const Joined: Story = { args: { optedIn: true, intent: "DATE", agenda: makeAgenda(true) } };
export const Locked: Story = {
  args: { optedIn: true, intent: "DATE", agenda: makeAgenda(true), canEdit: false },
};
export const ResultAvailable: Story = { args: { hasCycle: false, canEdit: false } };
export const NeedsProfile: Story = { args: { eligible: false, agenda: makeAgenda(false, false) } };

export const CarouselControlsAndSwipe: Story = {
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

export const CarouselAutoplay: Story = {
  name: "轮播 / 五秒自动播放与悬停暂停",
  globals: { viewport: { value: "desktop1280" } },
  play: async ({ canvas, userEvent }) => {
    const carousel = canvas.getByRole("complementary", { name: "活动轮播" });
    const first = within(carousel).getByRole("button", { name: "切换到LiLink 1v1 · 专人服务" });
    const second = within(carousel).getByRole("button", { name: "切换到商家合作 · 筹备中" });
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"), { timeout: 6500 });
    await userEvent.hover(carousel);
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.unhover(carousel);
    await waitFor(() => expect(first).toHaveAttribute("aria-pressed", "true"), { timeout: 6500 });
  },
};

export const CarouselFocusAndDialogPause: Story = {
  name: "轮播 / 焦点与活动弹窗暂停",
  play: async ({ canvas, userEvent }) => {
    const carousel = canvas.getByRole("complementary", { name: "活动轮播" });
    const second = within(carousel).getByRole("button", { name: "切换到商家合作 · 筹备中" });
    await userEvent.click(second);
    await userEvent.unhover(carousel);
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(carousel).getByRole("button", { name: "查看活动说明 ↗" }));
    await userEvent.unhover(carousel);
    await expect(canvas.getByRole("dialog", { name: "商家合作活动" })).toBeVisible();
    await expect(
      canvas.getByText("商家合作活动正在筹备，开放后会公布活动时间、优惠内容和参与方式。")
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "知道了" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const CarouselParentPause: Story = {
  name: "轮播 / 报名弹窗打开时暂停",
  args: { activitiesPaused: true },
  play: async ({ canvas }) => {
    const first = canvas.getByRole("button", { name: "切换到LiLink 1v1 · 专人服务" });
    await new Promise(resolve => setTimeout(resolve, 5500));
    await expect(first).toHaveAttribute("aria-pressed", "true");
  },
};
