import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import appShellStyles from "../_components/AppShell.module.css";
import { ReferralsClient } from "./referrals-client";
import { referralFixtures, type ReferralFixtureName } from "./referrals.fixtures";

const apiBaseUrl = "http://localhost:4000/v1";

const referralStoryHandlers = [
  http.post(`${apiBaseUrl}/referral/events`, () => HttpResponse.json({ ok: true })),
];

const meta = {
  tags: ["!test"],
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

export const EduQuotaExhausted: Story = {
  tags: ["test"],
  ...fixtureStory("eduQuotaExhausted", "学校邮箱 / 名额已用完"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "我的邀请" })).toBeVisible();
    await expect(c.getByText(referralFixtures.eduQuotaExhausted.referralCode!)).toBeVisible();
    await expect(c.getByText("名额已用完", { exact: true })).toBeVisible();
    await expect(c.getByRole("button", { name: "邀请同学" })).toBeEnabled();
  },
};

export const NoReferralCode: Story = {
  tags: ["test"],
  ...fixtureStory("noReferralCode", "邀请码尚未生成"),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("尚未生成")).toBeVisible();
    await expect(c.queryByRole("button", { name: "复制邀请码" })).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: "邀请同学" })).toBeDisabled();
  },
};

export const Gallery: Story = {
  render: () => <div style={{ display: "grid", gap: 24 }}>
    {[referralFixtures.nonEduUser, referralFixtures.eduPartialQuota, referralFixtures.withInvitedFriends].map((initialReferral, index) => <ReferralsClient key={index} initialReferral={initialReferral} />)}
  </div>,
};
