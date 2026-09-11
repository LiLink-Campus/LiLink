import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { createMatchPageHandlerState } from "../../../../.storybook/msw-handlers";
import appShellStyles from "../_components/AppShell.module.css";
import { MatchClientView } from "./match-client";
import {
  matchDashboardFixtures,
  matchStoryUser,
} from "./match.fixtures";

const storybookTitle = "Dashboard/Match/Page States";
const matchPageFixedNow = "2030-04-10T12:00:00+08:00";

const meta = {
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
    currentUserId: args.initialUser.id,
  });

  return {
    args,
    beforeEach: matchPageHandlers.reset,
    parameters: {
      msw: {
        handlers: {
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
  name: "Matched, not introduced",
  ...fixtureStory("matchedNotIntroduced"),
} satisfies Story;

export const IntroducedContactCompleted = {
  name: "Introduced / contact completed",
  ...fixtureStory("introducedContactCompleted"),
} satisfies Story;

export const IntroducedWithMeetupScheduled = {
  name: "Introduced / meetup scheduled",
  ...fixtureStory("introducedWithMeetupScheduled"),
} satisfies Story;

export const LastRoundUnmatched = {
  name: "Last round unmatched",
  ...fixtureStory("lastRoundUnmatched"),
} satisfies Story;

export const LimitedVisibility = {
  name: "Limited visibility",
  ...fixtureStory("limitedVisibility"),
} satisfies Story;
