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
  tags: ["!test"],
  title: storybookTitle,
  component: MatchClientView,
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
  tags: ["test"],
  name: "Skipped introduction / ordinary unmatched result",
  ...fixtureStory("matchedNotIntroduced"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: /合拍的人，值得再等一等/ })).toBeVisible();
    await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
  },
} satisfies Story;

async function checkUnintroducedContact(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await expect(c.getByRole("heading", { name: /合拍的人，值得再等一等/ })).toBeVisible();
  await expect(c.queryByText("陈一诺")).not.toBeInTheDocument();
  await expect(c.queryByRole("button", { name: "打开来信，查看本轮匹配" })).not.toBeInTheDocument();
  await expect(c.queryByRole("button", { name: /举报/ })).not.toBeInTheDocument();
  await expect(c.queryByText("yinuo-story")).not.toBeInTheDocument();
  await expect(c.queryByText("yinuo@example.edu.cn")).not.toBeInTheDocument();
  await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
}

export const UnintroducedStaleContact = {
  tags: ["test"],
  name: "Unintroduced / stale contact stays hidden",
  ...fixtureStory("unintroducedStaleContact"),
  play: async ({ canvasElement }) => {
    await checkUnintroducedContact(canvasElement);

  },
} satisfies Story;

export const UnintroducedStaleEmail = {
  tags: ["test"],
  name: "Unintroduced / stale email fallback stays hidden",
  ...fixtureStory("unintroducedStaleEmail"),
  play: async ({ canvasElement }) => checkUnintroducedContact(canvasElement),
} satisfies Story;

const revealFixture = fixtureArgs("unintroducedStaleContact");
const unintroducedRevealId = "match-story-unintroduced-reveal";
export const UnintroducedReveal = {
  tags: ["test"],
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

export const IntroducedContactCompleted = {
  name: "Introduced / contact completed",
  ...fixtureStory("introducedContactCompleted"),
} satisfies Story;

export const IntroducedEmailFallback = {
  tags: ["test"],
  name: "Introduced / legacy email remains available",
  ...fixtureStory("introducedEmailFallback"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "查看上一轮结果 →" }));
    await expect(await c.findByText("yinuo@example.edu.cn")).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "复制联络邮箱" }));
    await expect(await c.findByText(/已复制|复制失败，请长按联系方式复制/)).toBeVisible();
  },
} satisfies Story;

export const IntroducedContactUnavailable = {
  tags: ["test"],
  name: "Introduced / contact unavailable",
  ...fixtureStory("introducedContactUnavailable"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "查看上一轮结果 →" }));
    await expect(await c.findByText("对方暂无可公开的联系方式。")).toBeVisible();
    await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
  },
} satisfies Story;

export const LastRoundUnmatched: Story = {
  tags: ["test"],
  ...fixtureStory("lastRoundUnmatched"),
  globals: { viewport: { value: "desktop1280" } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole("heading", { name: "合拍的人，值得再等一等" })).toBeVisible(); },
};

export const LimitedVisibility: Story = {
  tags: ["test"],
  ...fixtureStory("limitedVisibility"),
  args: {
    ...fixtureArgs("limitedVisibility"),
    initialDashboard: { ...matchDashboardFixtures.limitedVisibility, latestMatch: matchDashboardFixtures.introducedContactCompleted.latestMatch },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "上一轮匹配已受限" })).toBeVisible();
    await expect(c.getByText(/你已举报上一轮匹配对象/)).toBeVisible();
    await expect(c.queryByText(/陈一诺|chenyinuo_29|North Campus/)).not.toBeInTheDocument();
    await expect(c.queryByRole("button", { name: /^复制/ })).not.toBeInTheDocument();
    await expect(c.queryByRole("button", { name: "查看上一轮结果 →" })).not.toBeInTheDocument();
  },
};

const copyMatchId = "cm00000000000000000000006";
const copyEvents: Array<Record<string, unknown>> = [];
const copyFixture = fixtureArgs("introducedContactCompleted");
const longContact = "chen-yinuo-campus-exhibition-weekend-cooking-2029";
const copyDashboard = {
  ...copyFixture.initialDashboard,
  latestMatch: { ...copyFixture.initialDashboard.latestMatch!, id: copyMatchId,
    participants: copyFixture.initialDashboard.latestMatch!.participants.map(participant => participant.userId === matchStoryUser.id
      ? participant : { ...participant, contact: { type: "WECHAT" as const, label: "微信号", value: longContact } }),
  },
};
export const CopyContact = {
  tags: ["test"],
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
    await userEvent.click(c.getByRole("button", { name: "查看上一轮结果 →" }));
    const contact = await c.findByText(longContact);
    await expect(contact).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await expect(contact.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    await userEvent.click(await c.findByRole("button", { name: "复制微信号" }));
    await expect(await c.findByText(/已复制|复制失败，请长按联系方式复制/)).toBeVisible();
    await expect(copyEvents).toHaveLength(0);

  },
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
  tags: ["test"],
  args: { ...fixtureArgs("waitingNoResult"), initialDashboard: desktopHistoryDashboard },
  beforeEach: () => desktopHistoryHandlers.reset(),
  parameters: { msw: { handlers: { site: null, matchPage: desktopHistoryHandlers.handlers } } },
  globals: { viewport: { value: "desktop1280", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const history = canvas.getByRole("complementary", { name: "过往匹配" });
    await expect(history).toBeVisible();
    await expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    await expect(canvas.getByRole("heading", { name: "我的匹配", level: 1 })).toBeVisible();
    const initialHeight = history.getBoundingClientRect().height;
    const details = within(history).getByRole("button", { name: "查看详情" });
    await userEvent.click(details);
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "关闭匹配详情" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(details).toHaveFocus());
    await expect(Math.abs(history.getBoundingClientRect().height - initialHeight)).toBeLessThan(1);
    await expect(canvas.getByText("过往记录 →")).not.toBeVisible();
  },
} satisfies Story;

async function checkWaitingAction(canvasElement: HTMLElement, heading: string, label: string, href: string) {
  const c = within(canvasElement);
  await waitFor(() => expect(c.getByRole("heading", { name: heading })).toBeVisible());
  const action = c.getByRole("link", { name: label });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("href", href);
}

export const MissingIntentDesktop: Story = {
  tags: ["test"],
  ...fixtureStory("waitingNoResult"),
  args: {
    ...fixtureArgs("waitingNoResult"),
    initialDashboard: {
      ...matchDashboardFixtures.waitingNoResult,
      currentCycle: { ...matchDashboardFixtures.waitingNoResult.currentCycle!, intent: null },
    },
  },
  globals: { viewport: { value: "desktop1280" } },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole("button", { name: "确认参与本轮" })).toBeVisible(); },
};

export const IncompleteProfileDesktop: Story = {
  tags: ["test"],
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
  play: ({ canvasElement }) => checkWaitingAction(canvasElement, "下一封来信，值得期待", "去完善匹配资料 →", "/dashboard/profile"),
};

export const LockedMissingIntentDesktop: Story = {
  tags: ["test"],
  ...MissingIntentDesktop,
  args: {
    ...MissingIntentDesktop.args,
    initialDashboard: {
      ...MissingIntentDesktop.args!.initialDashboard!,
      currentCycle: { ...MissingIntentDesktop.args!.initialDashboard!.currentCycle!, status: "PREPARING" },
    },
  },
  play: async ({ canvasElement }) => { const c = within(canvasElement); await expect(c.getByText("本轮报名已截止")).toBeVisible(); await expect(c.queryByRole("button", { name: "确认参与本轮" })).not.toBeInTheDocument(); },
};
