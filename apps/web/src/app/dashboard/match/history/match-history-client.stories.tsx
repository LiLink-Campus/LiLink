import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { createMatchPageHandlerState } from "../../../../../.storybook/msw-handlers";
import { MatchHistoryClient } from "./match-history-client";
import { matchDashboardFixtures, matchStoryUser } from "../match.fixtures";

const handlers = createMatchPageHandlerState({
  initialDashboard: matchDashboardFixtures.unintroducedStaleContact,
});

const meta = {
  title: "Dashboard/Match/History Disclosure",
  component: MatchHistoryClient,
  tags: ["smoke"],
  globals: { viewport: { value: "mobile390" } },
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/dashboard/match/history" } },
    msw: { handlers: { site: null, matchPage: handlers.handlers } },
  },
  beforeEach: () => handlers.reset(),
  args: {
    initialUser: matchStoryUser,
    initialDashboard: matchDashboardFixtures.unintroducedStaleContact,
  },
} satisfies Meta<typeof MatchHistoryClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnintroducedStaleContact: Story = {
  name: "Unintroduced / history details keep stale contact hidden",
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("未匹配到")).toBeVisible();
    await expect(c.getByText("你已参加这轮匹配，但暂未找到合适的同学。")).toBeVisible();
    await expect(c.queryByText(/陈一诺|yinuo-story|yinuo@example.edu.cn/)).not.toBeInTheDocument();
    await expect(c.queryByText("查看匹配详情")).not.toBeInTheDocument();
    await expect(c.queryByRole("button", { name: /举报/ })).not.toBeInTheDocument();
  },
};

export const UnintroducedStaleContactDesktop: Story = {
  ...UnintroducedStaleContact,
  globals: { viewport: { value: "desktop1280" } },
};

export const LongRoundTitle: Story = {
  name: "Unintroduced / long round name wraps on mobile",
  args: {
    initialDashboard: {
      ...matchDashboardFixtures.unintroducedStaleContact,
      recentMatchHistory: matchDashboardFixtures.unintroducedStaleContact.recentMatchHistory.map(item => ({
        ...item,
        codename: "BrowserRegression20260919LongRoundNameWithoutWhitespace",
      })),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("未匹配到")).toBeVisible();
    const card = c.getByRole("listitem");
    await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
  },
};
