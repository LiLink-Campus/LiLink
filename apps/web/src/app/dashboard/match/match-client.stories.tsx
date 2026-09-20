import { http, HttpResponse } from "msw";
import { expect, userEvent, within, waitFor } from "storybook/test";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createMatchPageHandlerState } from "../../../../.storybook/msw-handlers";
import appShellStyles from "../_components/AppShell.module.css";
import { MatchClientView } from "./match-client";
import { markRevealSeen } from "./reveal-receipt";
import {
  matchDashboardFixtures,
  matchStoryUser,
} from "./match.fixtures";

const storybookTitle = "Dashboard/Match/Page States";
const matchPageFixedNow = "2030-04-10T12:00:00+08:00";

const meta = {
  title: storybookTitle,
  component: MatchClientView,
  tags: ["smoke"],
  globals: {
    viewport: {
      value: "mobile390",
    },
  },
  parameters: {
    layout: "fullscreen",
    fixedNow: matchPageFixedNow,
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/dashboard/match",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "100dvh", background: "var(--color-canvas)" }}>
        <main className={appShellStyles.main}>
          <Story />
        </main>
      </div>
    ),
  ],
} satisfies Meta<typeof MatchClientView>;

export default meta;

type Story = StoryObj<typeof meta>;

function fixtureArgs(fixtureName: keyof typeof matchDashboardFixtures) {
  return {
    initialNowMs: Date.parse(matchPageFixedNow),
    initialUser: matchStoryUser,
    initialDashboard: matchDashboardFixtures[fixtureName],
  };
}

function fixtureStory(fixtureName: keyof typeof matchDashboardFixtures) {
  const args = fixtureArgs(fixtureName);
  const matchPageHandlers = createMatchPageHandlerState({
    initialDashboard: args.initialDashboard,
  });

  return {
    args,
    beforeEach: () => {
      matchPageHandlers.reset();
      const match = args.initialDashboard.latestMatch;
      const round = args.initialDashboard.recentMatchHistory.find(item => item.match?.id === match?.id)?.cycleId ?? match?.id ?? "none";
      markRevealSeen(`${args.initialUser.id}:${round}`);
    },
    parameters: {
      msw: {
        handlers: {
          site: null,
          matchPage: matchPageHandlers.handlers,
        },
      },
    },
  };
}

export const WaitingNoResult = {
  name: "Waiting / no result",
  ...fixtureStory("waitingNoResult"),
} satisfies Story;

export const MatchedNotIntroduced = {
  name: "Skipped introduction / ordinary unmatched result",
  ...fixtureStory("matchedNotIntroduced"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: /本轮未匹配到对象|这一次，暂未遇到合适的同学/ })).toBeVisible();
    await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
  },
} satisfies Story;

async function checkUnintroducedContact(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await expect(c.getByRole("heading", { name: /本轮未匹配到对象|这一次，暂未遇到合适的同学/ })).toBeVisible();
  await expect(c.queryByText("陈一诺")).not.toBeInTheDocument();
  await expect(c.queryByRole("button", { name: "打开来信，查看本轮匹配" })).not.toBeInTheDocument();
  await expect(c.queryByRole("button", { name: /举报/ })).not.toBeInTheDocument();
  await expect(c.queryByText("yinuo-story")).not.toBeInTheDocument();
  await expect(c.queryByText("yinuo@example.edu.cn")).not.toBeInTheDocument();
  await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
}

export const UnintroducedStaleContact = {
  name: "Unintroduced / stale contact stays hidden",
  ...fixtureStory("unintroducedStaleContact"),
  play: async ({ canvasElement }) => {
    await checkUnintroducedContact(canvasElement);

  },
} satisfies Story;

export const UnintroducedStaleEmail = {
  name: "Unintroduced / stale email fallback stays hidden",
  ...fixtureStory("unintroducedStaleEmail"),
  play: async ({ canvasElement }) => checkUnintroducedContact(canvasElement),
} satisfies Story;

const revealFixture = fixtureArgs("unintroducedStaleContact");
const unintroducedRevealId = "match-story-unintroduced-reveal";
export const UnintroducedReveal = {
  name: "Unintroduced / no envelope is offered",
  args: {
    ...revealFixture,
    initialDashboard: {
      ...revealFixture.initialDashboard,
      latestMatch: { ...revealFixture.initialDashboard.latestMatch!, id: unintroducedRevealId },
      recentMatchHistory: [],
    },
  },
  beforeEach: () => {
    window.localStorage.removeItem(`lilink:match-reveal:v1:${matchStoryUser.id}:${unintroducedRevealId}`);
  },
  play: async ({ canvasElement }) => {
    await checkUnintroducedContact(canvasElement);
  },
} satisfies Story;

export const UnintroducedStaleContactDesktop = {
  ...UnintroducedStaleContact,
  globals: { viewport: { value: "desktop1280" } },
} satisfies Story;

export const IntroducedContactCompleted = {
  name: "Introduced / contact completed",
  ...fixtureStory("introducedContactCompleted"),
} satisfies Story;

export const IntroducedEmailFallback = {
  name: "Introduced / legacy email remains available",
  ...fixtureStory("introducedEmailFallback"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText("yinuo@example.edu.cn")).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "复制联络邮箱" }));
    await expect(await c.findByText(/已复制|复制失败，请长按联系方式复制/)).toBeVisible();
  },
} satisfies Story;

export const IntroducedContactUnavailable = {
  name: "Introduced / contact unavailable",
  ...fixtureStory("introducedContactUnavailable"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText("对方暂无可公开的联系方式。")).toBeVisible();
    await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
  },
} satisfies Story;

export const LastRoundUnmatched = {
  name: "Last round unmatched",
  ...fixtureStory("lastRoundUnmatched"),
} satisfies Story;

export const LimitedVisibility = {
  name: "Limited visibility",
  ...fixtureStory("limitedVisibility"),
} satisfies Story;

const copyMatchId = "cm00000000000000000000006";
const copyEvents: Array<Record<string, unknown>> = [];
const copyFixture = fixtureArgs("introducedContactCompleted");
const copyDashboard = {
  ...copyFixture.initialDashboard,
  latestMatch: { ...copyFixture.initialDashboard.latestMatch!, id: copyMatchId },
};
export const CopyContact = {
  name: "Copy contact without legacy analytics",
  args: { ...copyFixture, initialDashboard: copyDashboard },
  beforeEach: () => {
    copyEvents.length = 0;
    markRevealSeen(`${copyFixture.initialUser.id}:${copyMatchId}`);
  },
  parameters: {
    msw: { handlers: { analytics: [
      http.post("http://localhost:4000/v1/product-events", async ({ request }) => {
        const event = await request.json() as Record<string, unknown>;
        if (event.name === "match_contact_copy_clicked") copyEvents.push(event);
        return HttpResponse.json({ ok: true, recorded: true });
      }),
    ] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "复制微信号" }));
    await expect(await c.findByText(/已复制|复制失败，请长按联系方式复制/)).toBeVisible();
    await expect(copyEvents).toHaveLength(0);

  },
} satisfies Story;

export const CopyContactDesktop = {
  ...CopyContact,
  globals: { viewport: { value: "desktop1280" } },
} satisfies Story;

const desktopHistoryDashboard = {
  ...matchDashboardFixtures.waitingNoResult,
  recentMatchHistory: [{
    cycleId: "story-history-introduced",
    codename: "2029 冬日周",
    revealAt: "2029-12-15T12:00:00.000Z",
    participationStatus: "OPTED_IN" as const,
    result: "MATCHED" as const,
    visibility: "VISIBLE" as const,
    limitedReason: null,
    match: matchDashboardFixtures.introducedContactCompleted.latestMatch,
  }, ...matchDashboardFixtures.lastRoundUnmatched.recentMatchHistory, ...matchDashboardFixtures.matchedNotIntroduced.recentMatchHistory],
};
const desktopHistoryHandlers = createMatchPageHandlerState({ initialDashboard: desktopHistoryDashboard });

export const DesktopWithHistory = {
  args: { ...fixtureArgs("waitingNoResult"), initialDashboard: desktopHistoryDashboard },
  beforeEach: () => desktopHistoryHandlers.reset(),
  parameters: { msw: { handlers: { site: null, matchPage: desktopHistoryHandlers.handlers } } },
  globals: { viewport: { value: "desktop1280", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const history = canvas.getByRole("complementary", { name: "过往匹配" });
    await expect(history).toBeVisible();
    await expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    const current = canvas.getByRole("heading", { name: "本轮匹配" }).parentElement!.parentElement!;
    await expect(Math.abs(history.getBoundingClientRect().height - current.getBoundingClientRect().height)).toBeLessThan(1);
    await expect(canvas.getByRole("heading", { name: "我的匹配", level: 1 })).toBeVisible();
    const initialHeight = history.getBoundingClientRect().height;
    const details = within(history).getByRole("button", { name: "查看详情" });
    await userEvent.click(details);
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "关闭匹配详情" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(details).toHaveFocus());
    await expect(Math.abs(history.getBoundingClientRect().height - initialHeight)).toBeLessThan(1);
    await expect(Math.abs(current.getBoundingClientRect().height - initialHeight)).toBeLessThan(1);
    await expect(canvas.getByRole("link", { name: "过往匹配记录", hidden: true })).not.toBeVisible();
  },
} satisfies Story;

async function checkWaitingAction(canvasElement: HTMLElement, heading: string, label: string, href: string) {
  const c = within(canvasElement);
  await waitFor(() => expect(c.getByRole("heading", { name: heading })).toBeVisible());
  const action = c.getByRole("link", { name: label });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("href", href);
}

export const LastRoundUnmatchedDesktop: Story = {
  ...fixtureStory("lastRoundUnmatched"),
  globals: { viewport: { value: "desktop1280" } },
  play: ({ canvasElement }) => checkWaitingAction(canvasElement, "本轮未匹配到对象", "去完善匹配资料", "/dashboard/profile"),
};

export const MissingIntentDesktop: Story = {
  ...fixtureStory("waitingNoResult"),
  args: {
    ...fixtureArgs("waitingNoResult"),
    initialDashboard: {
      ...matchDashboardFixtures.waitingNoResult,
      currentCycle: { ...matchDashboardFixtures.waitingNoResult.currentCycle!, intent: null },
    },
  },
  globals: { viewport: { value: "desktop1280" } },
  play: ({ canvasElement }) => checkWaitingAction(canvasElement, "待选择本周意向", "返回首页选择", "/dashboard"),
};

export const MissingIntentMobile: Story = {
  ...MissingIntentDesktop,
  globals: { viewport: { value: "mobile390" } },
};

export const IncompleteProfileDesktop: Story = {
  ...fixtureStory("waitingNoResult"),
  args: {
    ...fixtureArgs("waitingNoResult"),
    initialDashboard: {
      ...matchDashboardFixtures.waitingNoResult,
      questionnaireSubmittedAt: null,
      currentCycle: null,
    },
  },
  globals: { viewport: { value: "desktop1280" } },
  play: ({ canvasElement }) => checkWaitingAction(canvasElement, "还没有匹配结果", "去完善匹配资料", "/dashboard/profile"),
};

export const IncompleteProfileMobile: Story = {
  ...IncompleteProfileDesktop,
  globals: { viewport: { value: "mobile390" } },
};

export const LockedMissingIntentDesktop: Story = {
  ...MissingIntentDesktop,
  args: {
    ...MissingIntentDesktop.args,
    initialDashboard: {
      ...MissingIntentDesktop.args!.initialDashboard!,
      currentCycle: { ...MissingIntentDesktop.args!.initialDashboard!.currentCycle!, status: "PREPARING" },
    },
  },
  play: ({ canvasElement }) => checkWaitingAction(canvasElement, "本轮已锁定", "去完善匹配资料", "/dashboard/profile"),
};
