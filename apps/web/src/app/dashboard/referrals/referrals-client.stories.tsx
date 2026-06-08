import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import appShellStyles from "../_components/AppShell.module.css";
import { ReferralsClient } from "./referrals-client";
import {
  referralFixtures,
  type ReferralFixtureName,
} from "./referrals.fixtures";

const apiBaseUrl = "http://localhost:4000/v1";

const referralStoryHandlers = [
  http.post(`${apiBaseUrl}/referral/events`, () =>
    HttpResponse.json({ ok: true }),
  ),
];

const meta = {
  title: "Dashboard/Referrals/Page States",
  component: ReferralsClient,
  globals: {
    viewport: {
      value: "mobile390",
    },
  },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/dashboard/referrals",
      },
    },
    msw: {
      handlers: {
        referral: referralStoryHandlers,
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
} satisfies Meta<typeof ReferralsClient>;

export default meta;

type Story = StoryObj<typeof meta>;

function fixtureStory(fixtureName: ReferralFixtureName, name: string) {
  return {
    name,
    args: {
      initialReferral: referralFixtures[fixtureName],
    },
  } satisfies Story;
}

export const NonEduUser = fixtureStory(
  "nonEduUser",
  "普通邮箱 / 仅可分享链接",
);

export const EduWithFullQuota = fixtureStory(
  "eduWithFullQuota",
  "学校邮箱 / 名额充足",
);

export const EduPartialQuota = fixtureStory(
  "eduPartialQuota",
  "学校邮箱 / 已用部分名额",
);

export const EduQuotaExhausted = fixtureStory(
  "eduQuotaExhausted",
  "学校邮箱 / 名额已用完",
);

export const WithInvitedFriends = fixtureStory(
  "withInvitedFriends",
  "已有邀请记录",
);

export const NoReferralCode = fixtureStory(
  "noReferralCode",
  "邀请码尚未生成",
);
