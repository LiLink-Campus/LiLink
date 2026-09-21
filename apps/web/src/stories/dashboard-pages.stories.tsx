import { LIFESTYLE_QUESTIONS } from "@lilink/shared";
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, userEvent, within, waitFor } from "storybook/test";
import { http, HttpResponse } from "msw";
import { PwaInstallProvider } from "@/app/_components/PwaInstall";
import { UserCenter } from "@/app/dashboard/me/user-center";
import { HomeClient } from "@/app/dashboard/home-client";
import { ProfileClient } from "@/app/dashboard/profile/profile-client";
import { CouponsClient } from "@/app/dashboard/coupons/coupons-client";
import { ReferralsClient } from "@/app/dashboard/referrals/referrals-client";
import { MatchHistoryClient } from "@/app/dashboard/match/history/match-history-client";
import Loading from "@/app/dashboard/loading";
import DashboardError from "@/app/dashboard/error";
import {
  matchDashboardFixtures as dashboards,
  matchStoryUser as user,
} from "@/app/dashboard/match/match.fixtures";
import { referralFixtures } from "@/app/dashboard/referrals/referrals.fixtures";
import { contacts, questions, schools, coupon, now, savedProfile } from "./site-fixtures";
import { api, dashboardShell, failure, route, visible, siteHandlers } from "./site-support";

const meta = {
  id: "site-dashboard",
  title: "全站/用户中心",
  tags: ["smoke", "page"],
  decorators: [dashboardShell],
  parameters: { fullSite: true, ...route("/dashboard") },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const homeProps = {
  initialNowMs: Date.parse(now),
  initialUser: user,
  initialDashboard: dashboards.waitingNoResult,
  questionnairePercent: 100,
  questionnaireSubmitted: true,
  questionnaireMissingOneLinerIntro: false,
  questionnaireEligibleToOptIn: true,
  questionnaireHasIncompleteDraft: false,
  questionnaireAttention: null,
  contactPreferences: contacts,
};
const profileProps = {
  initialUser: user,
  initialDashboard: { ...dashboards.waitingNoResult, questionnaireSubmittedAt: null },
  initialQuestions: [...questions, ...LIFESTYLE_QUESTIONS.map(question => ({ id: question.key, key: question.key, prompt: question.prompt, type: "SINGLE_SELECT" as const, options: question.options.map(label => ({ label, value: label })) }))],
  initialSchools: schools.schools,
  initialSavedQuestionnaire: null,
  initialContactPreferences: contacts,
};
export const HomeJoined: Story = {
  render: () => <HomeClient {...homeProps} />,
  play: visible("你已报名本轮匹配"),
};
export const HomeNewUser: Story = {
  render: () => (
    <HomeClient
      {...homeProps}
      initialDashboard={{
        ...dashboards.waitingNoResult,
        currentCycle: {
          ...dashboards.waitingNoResult.currentCycle!,
          participationStatus: "OPTED_OUT",
        },
      }}
      questionnaireEligibleToOptIn={false}
      questionnairePercent={0}
      questionnaireSubmitted={false}
    />
  ),
  play: visible("先完成资料，再报名匹配"),
};
export const ChangeIntent: Story = {
  ...HomeJoined,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "更换匹配意向" }));
    await expect(c.getByRole("dialog")).toBeVisible();
  },
};
export const CancelParticipation: Story = {
  ...HomeJoined,
  parameters: {
    msw: {
      handlers: {
        site: [
          http.put(`${api}/me/participation`, () => HttpResponse.json({ ok: true })),
          ...siteHandlers,
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "取消参与" }));
    await userEvent.click(await c.findByRole("button", { name: "确认取消报名" }));
    await expect(await c.findByText(/已取消本轮报名/)).toBeVisible();
  },
};
export const ParticipationFailure: Story = {
  ...HomeJoined,
  parameters: {
    msw: { handlers: { site: [failure("/me/participation", "put"), ...siteHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "取消参与" }));
    await userEvent.click(await c.findByRole("button", { name: "确认取消报名" }));
    await expect(await c.findByText(/模拟服务暂时不可用/)).toBeVisible();
  },
};
async function jumpQuestion(canvasElement: HTMLElement, title: string) {
  const c = within(canvasElement);
  const desktopDirectory = c.queryByRole("complementary", { name: "桌面题目目录" });
  if (desktopDirectory) {
    await userEvent.click(within(desktopDirectory).getByRole("button", { name: new RegExp(`题：${title}`) }));
    return;
  }
  await userEvent.click(c.getByRole("button", { name: /题目目录/ }));
  const dialog = within(c.getByRole("dialog", { name: "题目目录" }));
  await userEvent.click(dialog.getByRole("button", { name: new RegExp(`题：${title}`) }));
}
export const Profile: Story = {
  globals: { viewport: { value: "mobile390", isRotated: false } },
  parameters: route("/dashboard/profile"),
  render: () => <ProfileClient {...profileProps} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByPlaceholderText("希望 TA 怎样称呼你")).toBeVisible();
    await expect(c.queryByRole("group", { name: "国籍" })).not.toBeInTheDocument();
    await expect(c.queryByRole("group", { name: "语言（可多选）" })).not.toBeInTheDocument();
    await expect(c.queryByText("不填写", { exact: true })).not.toBeInTheDocument();
    await expect(c.getByLabelText("问卷保存状态")).toHaveTextContent("尚未填写");
    await expect(c.getByLabelText("问卷保存状态")).not.toHaveTextContent("草稿已自动保存");
  },
};
export const ProfilePartner: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /希望遇见谁/ }));
    await expect(c.queryByRole("group", { name: "希望对方的国籍" })).not.toBeInTheDocument();
    await expect(c.queryByRole("group", { name: "希望对方的语言" })).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: /希望遇见谁/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  },
};
export const ProfileValues: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /价值观/ }));
    await expect(c.getByRole("group", { name: questions[0].prompt })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "下一题 →" }));
    await userEvent.click(c.getByRole("button", { name: "下一题 →" }));
    await expect(c.getByText("比较喜欢")).toBeVisible();
    await expect(c.getByRole("radio", { name: "比较喜欢" })).toBeEnabled();
  },
};
export const BirthDateDialog: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "出生日期");
    await userEvent.click(c.getByRole("button", { name: "选择出生日期" }));
    await expect(c.getByRole("dialog", { name: "选择出生日期" })).toBeVisible();
    const bounds = c.getByRole("dialog", { name: "选择出生日期" }).getBoundingClientRect();
    await expect(Math.abs(bounds.x + bounds.width / 2 - window.innerWidth / 2)).toBeLessThan(2);
    await expect(Math.abs(bounds.y + bounds.height / 2 - window.innerHeight / 2)).toBeLessThan(2);
  },
};
export const ContactFailure: Story = {
  ...Profile,
  parameters: {
    ...route("/dashboard/profile"),
    msw: { handlers: { site: [failure("/me/contact-preferences", "put"), ...siteHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "联系方式");
    await userEvent.click(c.getByRole("radio", { name: "微信" }));
    await userEvent.type(c.getByLabelText("微信内容"), "story_wechat");
    await expect(await c.findByRole("button", { name: "重试保存" })).toBeVisible();
  },
};
export const History: Story = {
  parameters: route("/dashboard/match/history"),
  render: () => (
    <MatchHistoryClient initialUser={user} initialDashboard={dashboards.lastRoundUnmatched} />
  ),
  play: visible("过往匹配记录"),
};
export const HistoryMatched: Story = {
  parameters: route("/dashboard/match/history"),
  render: () => <MatchHistoryClient initialUser={user} initialDashboard={{
    ...dashboards.introducedContactCompleted,
    recentMatchHistory: [{
      cycleId: "history-visible", codename: "校园相遇", revealAt: "2029-12-15T12:00:00.000Z",
      participationStatus: "OPTED_IN", result: "MATCHED", visibility: "VISIBLE", limitedReason: null,
      match: dashboards.introducedContactCompleted.latestMatch,
    }],
  }} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText(/联系方式：/)).toBeVisible();
    await expect(c.queryByText("查看匹配详情")).not.toBeInTheDocument();
  },
};
export const HistoryEmpty: Story = {
  parameters: route("/dashboard/match/history"),
  render: () => (
    <MatchHistoryClient initialUser={user} initialDashboard={dashboards.waitingNoResult} />
  ),
  play: visible("还没有过往匹配记录"),
};
export const Coupons: Story = {
  parameters: route("/dashboard/coupons"),
  render: () => (
    <CouponsClient
      initialUser={user}
      initialCoupons={[
        coupon,
        {
          ...coupon,
          id: "expired",
          status: "EXPIRED",
          title: "已过期的双人套餐",
          expiresAt: "2030-04-01T08:00:00Z",
        },
        { ...coupon, id: "redeemed", status: "REDEEMED", title: "已使用的咖啡券", redeemedAt: now },
      ]}
    />
  ),
  play: visible(coupon.title),
};
export const CouponCode: Story = {
  ...Coupons,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "查看核销码" }));
    await expect(await c.findByRole("dialog")).toBeVisible();
  },
};
export const CouponsEmpty: Story = {
  parameters: route("/dashboard/coupons"),
  render: () => <CouponsClient initialUser={user} initialCoupons={[]} />,
  play: visible(/暂无|还没有/),
};
export const CouponsFailure: Story = {
  parameters: {
    ...route("/dashboard/coupons"),
    msw: { handlers: { site: [failure("/me/coupons"), ...siteHandlers] } },
  },
  render: () => <CouponsClient initialUser={user} />,
  play: visible(/模拟服务暂时不可用/),
};
export const Referrals: Story = {
  parameters: route("/dashboard/referrals"),
  render: () => <ReferralsClient initialReferral={referralFixtures.eduWithFullQuota} />,
  play: visible(/3E4V87GBP2/),
};
export const DashboardLoading: Story = {
  render: () => <Loading />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("正在加载 Dashboard")).toBeVisible();
  },
};
export const ContactSaved: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "联系方式");
    await userEvent.click(c.getByRole("radio", { name: "微信" }));
    await userEvent.type(c.getByLabelText("微信内容"), "story_wechat");
    await expect(await c.findByText("已自动保存 · 匹配成功后向对方展示")).toBeVisible();
    await expect(c.getByLabelText("微信内容")).toHaveValue("story_wechat");
  },
};

export const ProfileComplete: Story = {
  ...Profile,
  render: () => (
    <ProfileClient
      {...profileProps}
      initialDashboard={dashboards.waitingNoResult}
      initialSavedQuestionnaire={savedProfile}
    />
  ),
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, "一句话介绍");
    await expect(
      within(canvasElement).getByDisplayValue(savedProfile.answers.hard_one_liner_intro)
    ).toBeVisible();
  },
};
export const HomeNoCycle: Story = {
  render: () => (
    <HomeClient
      {...homeProps}
      initialDashboard={{ ...dashboards.waitingNoResult, currentCycle: null }}
    />
  ),
  play: visible("当前暂无开放的匹配"),
};

export const ProfileRequiredFields: Story = {
  ...Profile,
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { profileSave: [http.put("/api/questionnaire", () => HttpResponse.json({ saveState: "DRAFT", questionnaireSubmittedAt: null, hasDraft: true }))] } } },
  render: () => <ProfileClient {...profileProps} initialSavedQuestionnaire={{
    versionId: "profile-layout-regression",
    currentVersionId: "profile-layout-regression",
    answers: {},
    submittedAt: null,
    draft: null,
    attention: {
      currentVersionId: "profile-layout-regression",
      acknowledgedKeys: [], pendingUpdatedKeys: [],
      missingRequiredKeys: ["hard_birth_date", "hard_gender", "hard_looks", "hard_height_cm", "hard_weight_kg"],
      pendingKeys: ["hard_birth_date", "hard_gender", "hard_looks", "hard_height_cm", "hard_weight_kg"],
      items: ["hard_birth_date", "hard_gender", "hard_looks", "hard_height_cm", "hard_weight_kg"].map(key => ({ key, prompt: key, missingRequired: true, updated: false, acknowledged: false })),
    },
  }} />,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, "出生日期");
    await expect(within(canvasElement).getByRole("button", { name: "选择出生日期" })).toBeVisible();
    await expect(within(canvasElement).queryByRole("group", { name: "性别" })).toBeNull();
    const c = within(canvasElement);
    await userEvent.selectOptions(c.getByRole("combobox", { name: "出生年份" }), "2000");
    await userEvent.selectOptions(c.getByRole("combobox", { name: "出生月份" }), "2");
    await userEvent.selectOptions(c.getByRole("combobox", { name: "出生日期中的日" }), "29");
    await expect(c.getByText(/你现在/)).toBeVisible();
    await userEvent.selectOptions(c.getByRole("combobox", { name: "出生年份" }), "2001");
    await expect(c.getByRole("combobox", { name: "出生日期中的日" })).toHaveValue("");
    await expect(within(c.getByRole("combobox", { name: "出生日期中的日" })).queryByRole("option", { name: "29 日" })).toBeNull();
  },
};

export const ProfileIntro: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, "一句话介绍");
    await expect(within(canvasElement).getByRole("textbox", { name: /一句话介绍/ })).toBeVisible();
  },
};
export const ProfileContact: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, "联系方式");
    await expect(within(canvasElement).getByRole("textbox", { name: /内容$/ })).toBeVisible();
  },
};
export const ProfileGender: Story = {
  ...ProfileRequiredFields,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, "性别");
    await expect(within(canvasElement).getByRole("radio", { name: "非二元" })).toBeVisible();
  },
};
export const ProfileLooksRequired: Story = {
  ...ProfileRequiredFields,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, "颜值自评");
    await expect(within(canvasElement).getByRole("slider", { name: "颜值自评" })).toHaveAttribute("aria-valuetext", "未选择");
  },
};

export const ProfileLongChoices: Story = {
  ...Profile,
  render: () => <ProfileClient {...profileProps} initialQuestions={[
    { ...questions[0], options: Array.from({ length: 12 }, (_, index) => ({ value: `option-${index}`, label: `周末安排 ${index + 1}：一起散步、读书，慢慢了解彼此的生活习惯。` })) },
    ...profileProps.initialQuestions.slice(1),
  ]} />,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, questions[0].prompt);
    const c = within(canvasElement);
    const next = c.getByRole("button", { name: "下一题 →" });
    const top = next.getBoundingClientRect().top;
    const reader = c.getByRole("region", { name: "当前题目" });
    await waitFor(() => expect(c.getByText("↓ 下方还有内容")).toBeVisible());
    reader.scrollTop = (reader.scrollHeight - reader.clientHeight) / 2;
    await waitFor(() => expect(c.getByText("↓ 下方还有内容")).toBeVisible());
    const last = c.getByRole("radio", { name: /周末安排 12/ });
    const option = last.closest("label")!;
    reader.scrollTop = reader.scrollHeight;
    await waitFor(() => expect(c.getByText("↓ 下方还有内容")).not.toBeVisible());
    await expect(last).toBeVisible();
    // Allow subpixel rounding when scrolling to the content edge.
    await expect(option.getBoundingClientRect().bottom - c.getByRole("region", { name: "当前题目" }).getBoundingClientRect().bottom).toBeLessThanOrEqual(1);
    await expect(next.getBoundingClientRect().top).toBe(top);
    reader.scrollTop = 0;
    await waitFor(() => expect(c.getByText("↓ 下方还有内容")).toBeVisible());
  },
};

export const ProfileLongChoicesBottom: Story = {
  ...ProfileLongChoices,
  play: async (context) => {
    await ProfileLongChoices.play?.(context);
    const c = within(context.canvasElement);
    const reader = c.getByRole("region", { name: "当前题目" });
    reader.scrollTop = reader.scrollHeight;
    await waitFor(() => expect(c.getByText("↓ 下方还有内容")).not.toBeVisible());
  },
};

const profileVip = { active: true, activatedAt: now, expiresAt: "2099-01-01T00:00:00.000Z", durationDays: 30, priceYuan: "29.90", advancedFiltersAvailable: true };
export const ProfilePremiumLocked: Story = {
  parameters: route("/dashboard/profile"),
  render: () => <ProfileClient {...profileProps} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "希望对方的颜值");
    const looks = within(c.getByRole("group", { name: "希望对方的颜值至少几分？" }));
    await userEvent.click(looks.getByRole("radio", { name: "9分及以上" }));
    await expect(c.getByRole("dialog", { name: "开通 VIP，设置高级筛选" })).toBeVisible();
    await expect(c.getByRole("link", { name: "查看权益与开通" })).toHaveAttribute("href", "/dashboard/vip");
    await userEvent.click(c.getByRole("button", { name: "暂不开通，继续填写" }));
    await jumpQuestion(canvasElement, "希望对方的身高");
    const height = c.getByRole("combobox", { name: "希望对方身高下限" });
    const before = (height as HTMLSelectElement).value;
    await userEvent.selectOptions(height, "175");
    await expect(c.getByRole("dialog", { name: "开通 VIP，设置高级筛选" })).toBeVisible();
    await expect(height).toHaveValue(before);
    await userEvent.click(c.getByRole("button", { name: "暂不开通，继续填写" }));
    await jumpQuestion(canvasElement, "按学校排除");
    await userEvent.click(c.getByText("青禾大学", { exact: true }));
    await userEvent.click(within(c.getByRole("group", { name: "青禾大学 排除性别" })).getByText("男", { exact: true }));
    await expect(c.getByRole("dialog", { name: "开通 VIP，设置高级筛选" })).toBeVisible();
  },
};
export const ProfilePremiumActive: Story = {
  ...ProfilePremiumLocked,
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { site: [http.get(`${api}/me/vip`, () => HttpResponse.json(profileVip)), http.put("/api/questionnaire", () => HttpResponse.json({ saveState: "DRAFT", questionnaireSubmittedAt: null, hasDraft: true })), ...siteHandlers] } } },
  render: () => <ProfileClient {...profileProps} initialVip={profileVip} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "希望对方的颜值");
    await expect(c.getByRole("group", { name: "希望对方的颜值至少几分？" })).not.toBeDisabled();
    const looks = within(c.getByRole("group", { name: "希望对方的颜值至少几分？" }));
    await userEvent.click(looks.getByRole("radio", { name: "7分及以上" }));
    await expect(looks.getByRole("slider")).toHaveAttribute("aria-valuetext", "7分及以上");
    await expect(c.queryByRole("dialog")).toBeNull();

    await jumpQuestion(canvasElement, "希望对方锻炼频率");
    const exercise = within(c.getByRole("group", { name: "希望对方锻炼频率" }));
    await userEvent.click(exercise.getByText("每周 3–4 次", { exact: true }));
    await expect(exercise.getByRole("checkbox", { name: "每周 3–4 次" })).toBeChecked();
    await expect(c.queryByRole("dialog")).toBeNull();
    await jumpQuestion(canvasElement, "希望对方的身高");
    await userEvent.selectOptions(c.getByRole("combobox", { name: "希望对方身高下限" }), "175");
    await expect(c.getByRole("combobox", { name: "希望对方身高下限" })).toHaveValue("175");
    await jumpQuestion(canvasElement, "希望对方的体重");
    await userEvent.selectOptions(c.getByRole("combobox", { name: "希望对方体重下限" }), "55");
    await expect(c.getByRole("combobox", { name: "希望对方体重下限" })).toHaveValue("55");
    await jumpQuestion(canvasElement, "按学校排除");
    await userEvent.click(c.getByText("青禾大学", { exact: true }));
    const school = within(c.getByRole("group", { name: "青禾大学 排除性别" }));
    await userEvent.click(school.getByText("男", { exact: true }));
    await expect(school.getByRole("checkbox", { name: "男" })).toBeChecked();
  },
};
export const ProfileLifestyle: Story = {
  ...Profile,
  tags: ["smoke"],
  render: () => <ProfileClient {...profileProps} initialSavedQuestionnaire={{
    versionId: "lifestyle-regression", currentVersionId: "lifestyle-regression", answers: {}, submittedAt: null, draft: null,
    attention: { currentVersionId: "lifestyle-regression", acknowledgedKeys: [], pendingUpdatedKeys: [],
      missingRequiredKeys: LIFESTYLE_QUESTIONS.map(q => q.key), pendingKeys: LIFESTYLE_QUESTIONS.map(q => q.key),
      items: LIFESTYLE_QUESTIONS.map(q => ({ key: q.key, prompt: q.prompt, missingRequired: true, updated: false, acknowledged: false })),
    },
  }} />,
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { profileSave: [http.put("/api/questionnaire", () => HttpResponse.json({ saveState: "DRAFT", questionnaireSubmittedAt: null, hasDraft: true }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    for (const question of LIFESTYLE_QUESTIONS) {
      await jumpQuestion(canvasElement, question.key === "exercise_frequency" ? "锻炼情况" : question.prompt);
      const group = c.getByRole("group", { name: question.key === "exercise_frequency" ? "锻炼情况" : question.prompt });
      await expect(within(group).queryByRole("slider")).toBeNull();
      const rows = within(group).getAllByRole("radio").map(input => input.closest("label")!.getBoundingClientRect());
      rows.slice(1).forEach((row, index) => expect(row.top).toBeGreaterThanOrEqual(rows[index].bottom));
      await userEvent.click(within(group).getByRole("radio", { name: question.options[1] }));
      await expect(within(group).getByRole("radio", { name: question.options[1] })).toBeChecked();
      await expect(within(group).queryByText("本题待补完。")).toBeNull();
    }
  },
};

const centerStatus = { active: false, activatedAt: null, expiresAt: null, durationDays: 30, priceYuan: "29.9", advancedFiltersAvailable: true };
export const UserCenterFree: Story = {
  parameters: { ...route("/dashboard/me") },
  render: () => <UserCenter initialUser={user} initialStatus={centerStatus} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "用户中心" })).toBeVisible();
    await expect(c.getByRole("link", { name: "查看权益与激活" })).toHaveAttribute("href", "/dashboard/vip");
    await expect(c.getByRole("link", { name: /我的邀请/ })).toHaveAttribute("href", "/dashboard/referrals");
    await expect(c.getByRole("link", { name: /我的优惠券/ })).toHaveAttribute("href", "/dashboard/coupons");
  },
};
export const UserCenterActive: Story = {
  ...UserCenterFree,
  render: () => <UserCenter initialUser={user} initialStatus={{ ...centerStatus, active: true, activatedAt: "2026-09-17T00:00:00Z", expiresAt: "2099-10-17T00:00:00Z" }} />,
  parameters: { ...route("/dashboard/me"), msw: { handlers: { site: [http.get(`${api}/me/vip`, () => HttpResponse.json({ ...centerStatus, active: true, expiresAt: "2099-10-17T00:00:00Z" })), ...siteHandlers] } } },
  play: visible("已开通"),
};
export const UserCenterUnavailable: Story = { ...UserCenterFree, render: () => <UserCenter initialUser={user} initialStatus={null} />, play: visible("状态待刷新") };
export const UserCenterMenu: Story = {
  ...UserCenterFree,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /账号菜单/ }));
    const menu = within(c.getByRole("menu"));
    await expect(menu.getAllByRole("menuitem")).toHaveLength(2);
    await expect(menu.getByRole("menuitem", { name: "返回首页" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
  },
};
export const UserCenterDeleteDialog: Story = {
  ...UserCenterFree,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "注销账号" }));
    const dialog = within(c.getByRole("dialog"));
    await expect(dialog.getByRole("button", { name: "确认注销账号" })).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "暂不注销，返回" }));
    await expect(c.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const ProfileSaveFailure: Story = {
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { site: [http.put("/api/questionnaire", () => HttpResponse.json({ message: "Save unavailable" }, { status: 400 })), ...siteHandlers] } } },
  render: () => <ProfileClient {...profileProps} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText("昵称", { exact: true }), "测试");
    await expect(await c.findByRole("button", { name: "重试保存" }, { timeout: 5000 })).toBeVisible();
    await expect(c.queryByRole("button", { name: "立即重试" })).not.toBeInTheDocument();
  },
};

export const ProfileDirectory: Story = {
  ...Profile,
  tags: ["smoke"],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "价值观" }));
    await userEvent.click(c.getByRole("button", { name: "下一题 →" }));
    await userEvent.click(c.getByRole("button", { name: /题目目录/ }));
    const d = within(c.getByRole("dialog", { name: "题目目录" }));
    await expect(d.getByRole("button", { name: /价值观第 2 题/ })).toHaveAttribute("aria-current", "step");
    await userEvent.click(d.getByRole("button", { name: /价值观第 3 题/ }));
    await expect(c.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: /补全 .* 题 →/ })).toBeEnabled();
    await userEvent.click(c.getByRole("button", { name: /题目目录/ }));
  },
};

export const ProfileModuleBoundary: Story = {
  ...Profile,
  tags: ["smoke"],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /题目目录/ }));
    await userEvent.click(within(c.getByRole("dialog")).getByRole("button", { name: /关于你第 11 题/ }));
    await userEvent.click(c.getByRole("button", { name: "下一模块 →" }));
    await expect(c.getByRole("button", { name: "希望遇见谁" })).toHaveAttribute("aria-pressed", "true");
    await expect(c.getByRole("group", { name: "希望对方年龄" })).toBeVisible();
    await expect(c.queryByRole("group", { name: "希望对方的性别（可多选）" })).toBeNull();
    await userEvent.click(c.getByRole("button", { name: "← 上一模块" }));
    await expect(c.getByRole("button", { name: "关于你" })).toHaveAttribute("aria-pressed", "true");
    await expect(c.getByRole("button", { name: "下一模块 →" })).toBeEnabled();

    await userEvent.click(c.getByRole("button", { name: /题目目录/ }));
    await userEvent.click(within(c.getByRole("dialog")).getByRole("button", { name: /价值观第 3 题/ }));
    await userEvent.click(c.getByRole("button", { name: /补全 .* 题 →/ }));
    await expect(c.getByPlaceholderText("比如：喜欢散步和独立电影，期待遇见能一起分享日常的人。")).toBeVisible();
    await expect(c.getByRole("button", { name: "关于你" })).toHaveAttribute("aria-pressed", "true");
  },
};

export const ProfileLooksScore: Story = {
  ...Profile,
  parameters: ProfileLifestyle.parameters,
  tags: ["smoke"],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "颜值自评");
    const rating = within(c.getByRole("group", { name: "颜值自评" }));
    await expect(rating.getAllByRole("radio")).toHaveLength(10);
    await userEvent.click(rating.getByRole("radio", { name: "10" }));
    await expect(rating.getByRole("radio", { name: "10" })).toBeChecked();
    await expect(c.getByText("10分：无人可及")).toBeVisible();
    const slider = rating.getByRole("slider", { name: "颜值自评" });
    slider.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(rating.getByRole("radio", { name: "9" })).toBeChecked();
    await expect(slider).toHaveAttribute("aria-valuetext", "9");
    await expect(c.queryByRole("group", { name: "性别" })).toBeNull();
  },
};

export const ProfileWeightAcknowledgement: Story = {
  ...Profile,
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { profileSave: [
    http.put("/api/questionnaire", () => HttpResponse.json({ saveState: "DRAFT", questionnaireSubmittedAt: null, hasDraft: true })),
    http.put(`${api}/me/questionnaire/acknowledgement`, () => HttpResponse.json({ currentVersionId: "weight-regression", acknowledgedKeys: ["hard_weight_kg"] })),
  ] } } },
  render: () => <ProfileClient {...profileProps} initialSavedQuestionnaire={{
    versionId: "weight-regression", currentVersionId: "weight-regression", answers: { hard_weight_kg: 44 }, submittedAt: null, draft: null,
    attention: { currentVersionId: "weight-regression", acknowledgedKeys: [], pendingUpdatedKeys: ["hard_weight_kg"], missingRequiredKeys: [], pendingKeys: ["hard_weight_kg"],
      items: [{ key: "hard_weight_kg", prompt: "体重", missingRequired: false, updated: true, acknowledged: false }],
    },
  }} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "体重");
    await expect(c.getByText("本题有更新。")).toBeVisible();
    await userEvent.selectOptions(c.getByRole("combobox", { name: "选择你的体重" }), "45");
    await waitFor(() => expect(c.queryByText("本题有更新。")).toBeNull(), { timeout: 5000 });
  },
};

export const ProfilePartnerLifestyle: Story = {
  ...Profile,
  parameters: ProfileLifestyle.parameters,
  tags: ["smoke"],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await jumpQuestion(canvasElement, "希望对方吸烟情况");
    const smoking = within(c.getByRole("group", { name: "希望对方吸烟情况" }));
    await expect(smoking.getByRole("checkbox", { name: "不限" })).toBeChecked();
    await userEvent.click(smoking.getByText("不吸烟", { exact: true }));
    await userEvent.click(smoking.getByText("偶尔吸烟", { exact: true }));
    await expect(smoking.getByRole("checkbox", { name: "不吸烟" })).toBeChecked();
    await expect(smoking.getByRole("checkbox", { name: "偶尔吸烟" })).toBeChecked();
    await expect(smoking.getByRole("checkbox", { name: "不限" })).not.toBeChecked();
    await expect(c.queryByRole("dialog")).toBeNull();
    await jumpQuestion(canvasElement, "希望对方饮酒频率");
    await userEvent.click(within(c.getByRole("group", { name: "希望对方饮酒频率" })).getByText("不饮酒", { exact: true }));
    await expect(c.queryByRole("dialog")).toBeNull();
    await jumpQuestion(canvasElement, "希望对方锻炼频率");
    await userEvent.click(within(c.getByRole("group", { name: "希望对方锻炼频率" })).getByText("每周 3–4 次", { exact: true }));
    await expect(c.getByRole("dialog", { name: "开通 VIP，设置高级筛选" })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "暂不开通，继续填写" }));
    await jumpQuestion(canvasElement, "希望对方的颜值");
    await expect(c.getByRole("slider", { name: "对方颜值最低分" })).toHaveAttribute("aria-valuetext", "1分及以上");
    await jumpQuestion(canvasElement, "希望对方吸烟情况");
    await expect(within(c.getByRole("group", { name: "希望对方吸烟情况" })).getByRole("checkbox", { name: "不吸烟" })).toBeChecked();
  },
};

export const ProfileAutoAdvance: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /价值观/ }));
    const first = c.getByRole("group", { name: questions[0].prompt });
    await userEvent.click(within(first).getAllByRole("radio")[0]);
    await waitFor(() => expect(c.getByRole("group", { name: questions[1].prompt })).toBeVisible());
    await userEvent.click(c.getByRole("button", { name: "← 上一题" }));
    await expect(within(c.getByRole("group", { name: questions[0].prompt })).getAllByRole("radio")[0]).toBeChecked();
  },
};

export const ProfileExactMultiAdvance: Story = {
  ...Profile,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /价值观/ }));
    await userEvent.click(c.getByRole("button", { name: "下一题 →" }));
    const group = await c.findByRole("group", { name: questions[1].prompt });
    await expect(within(group).getByText("本题必须选择 2 项。")).toBeVisible();
    await userEvent.click(within(group).getByText("阅读", { exact: true }));
    await expect(group).toBeVisible();
    await userEvent.click(within(group).getByText("徒步", { exact: true }));
    await waitFor(() => expect(c.getByRole("group", { name: questions[2].prompt })).toBeVisible());
  },
};

function setReaderReducedMotion(reduced: boolean) {
  const original = window.matchMedia;
  window.matchMedia = (query) => {
    const media = original.call(window, query);
    if (query === "(prefers-reduced-motion: reduce)") {
      Object.defineProperty(media, "matches", { value: reduced });
    }
    return media;
  };
  return () => { window.matchMedia = original; };
}

async function startQuestionDeparture(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await userEvent.click(c.getByRole("button", { name: "价值观" }));
  const question = c.getByRole("group", { name: questions[0].prompt });
  const choices = within(question).getAllByRole("radio") as HTMLInputElement[];
  await userEvent.click(choices.find(choice => !choice.checked) ?? choices[0]);
  await waitFor(() => expect(question.getAnimations().some(animation => animation.playState === "running")).toBe(true), { interval: 10 });
  return question;
}

const transitionStory: Story = {
  ...Profile,
  tags: ["smoke"],
  parameters: ProfileRequiredFields.parameters,
  beforeEach: () => setReaderReducedMotion(false),
};

export const ProfileInterruptAdvance: Story = {
  ...transitionStory,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const question = await startQuestionDeparture(canvasElement);
    const departure = question.getAnimations()[0];
    fireEvent.click(c.getByRole("button", { name: "下一题 →" }));
    await expect(departure.playState).toBe("idle");
    await userEvent.click(c.getByRole("button", { name: "← 上一题" }));
    await expect(question).toBeVisible();
    await expect(getComputedStyle(question).opacity).toBe("1");
    await expect(question.getAnimations()).toHaveLength(0);
  },
};

export const ProfileInterruptModule: Story = {
  ...transitionStory,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const question = await startQuestionDeparture(canvasElement);
    const departure = question.getAnimations()[0];
    fireEvent.click(c.getByRole("button", { name: "关于你" }));
    await expect(departure.playState).toBe("idle");
    await userEvent.click(c.getByRole("button", { name: "价值观" }));
    await expect(question).toBeVisible();
    await expect(getComputedStyle(question).opacity).toBe("1");
    await expect(question.getAnimations()).toHaveLength(0);
  },
};

function ProfileUnmountFixture() {
  const [mounted, setMounted] = useState(true);
  return <>
    <button style={{ position: "fixed", top: 64, right: 8, zIndex: 100 }} onClick={() => setMounted(value => !value)}>{mounted ? "卸载问卷" : "重新挂载问卷"}</button>
    {mounted && <ProfileClient {...profileProps} />}
  </>;
}

export const ProfileInterruptUnmount: Story = {
  ...transitionStory,
  render: () => <ProfileUnmountFixture />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const question = await startQuestionDeparture(canvasElement);
    const departure = question.getAnimations()[0];
    fireEvent.click(c.getByRole("button", { name: "卸载问卷" }));
    await expect(question.isConnected).toBe(false);
    await expect(departure.playState).toBe("idle");
    await expect(question.getAnimations()).toHaveLength(0);
    await userEvent.click(c.getByRole("button", { name: "重新挂载问卷" }));
    await userEvent.click(c.getByRole("button", { name: "价值观" }));
    await expect(c.getByRole("group", { name: questions[0].prompt })).toBeVisible();
  },
};

export const ProfileReducedMotionAdvance: Story = {
  ...transitionStory,
  beforeEach: () => setReaderReducedMotion(true),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "价值观" }));
    const question = c.getByRole("group", { name: questions[0].prompt });
    await userEvent.click(within(question).getAllByRole("radio")[0]);
    await waitFor(() => expect(c.getByRole("group", { name: questions[1].prompt })).toBeVisible());
    await expect(question.getAnimations()).toHaveLength(0);
    await userEvent.click(c.getByRole("button", { name: "← 上一题" }));
    await expect(question).toBeVisible();
    await expect(getComputedStyle(question).opacity).toBe("1");
  },
};

export const ProfileInterruptHash: Story = {
  ...transitionStory,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const question = await startQuestionDeparture(canvasElement);
    const departure = question.getAnimations()[0];
    window.location.hash = `profile-attention-${questions[2].key}`;
    await waitFor(() => expect(c.getByRole("group", { name: questions[2].prompt })).toBeVisible());
    await expect(departure.playState).toBe("idle");
    await new Promise(resolve => window.setTimeout(resolve, 200));
    await expect(c.getByRole("group", { name: questions[2].prompt })).toBeVisible();
    await expect(question.getAnimations()).toHaveLength(0);

    await startQuestionDeparture(canvasElement);
    window.location.hash = "profile-attention-hard_partner_age_min";
    await waitFor(() => expect(c.getByRole("group", { name: "希望对方年龄" })).toBeVisible());
    await new Promise(resolve => window.setTimeout(resolve, 200));
    await expect(c.getByRole("group", { name: "希望对方年龄" })).toBeVisible();
    await expect(question.getAnimations()).toHaveLength(0);
    await userEvent.click(c.getByRole("button", { name: "价值观" }));
    await expect(question).toBeVisible();
    await expect(getComputedStyle(question).opacity).toBe("1");
  },
};

let activateVipDuringReaderRefresh = false;
export const ProfileInterruptReaderRefresh: Story = {
  ...transitionStory,
  beforeEach: () => {
    activateVipDuringReaderRefresh = false;
    return setReaderReducedMotion(false);
  },
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { site: [
    http.get(`${api}/me/vip`, () => HttpResponse.json(activateVipDuringReaderRefresh ? profileVip : { active: false, expiresAt: null })),
    http.put("/api/questionnaire", () => HttpResponse.json({ saveState: "DRAFT", questionnaireSubmittedAt: null, hasDraft: true })),
    ...siteHandlers,
  ] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const question = await startQuestionDeparture(canvasElement);
    const departure = question.getAnimations()[0];
    activateVipDuringReaderRefresh = true;
    fireEvent.focus(window);
    await waitFor(() => expect(c.getAllByText("高级筛选 · VIP 已启用").length).toBeGreaterThan(0));
    await expect(departure.playState).toBe("idle");
    await new Promise(resolve => window.setTimeout(resolve, 200));
    // The refresh may finish after the 160 ms advance on a busy runner.
    const nextQuestion = canvasElement.querySelector<HTMLElement>(`#profile-attention-${questions[1].key}`)!;
    await expect(question.dataset.readerHidden === "false" || nextQuestion.dataset.readerHidden === "false").toBe(true);
    await expect(question.getAnimations()).toHaveLength(0);
    if (question.dataset.readerHidden === "true") {
      await userEvent.click(c.getByRole("button", { name: "← 上一题" }));
    }
    await expect(question).toBeVisible();
    await expect(getComputedStyle(question).opacity).toBe("1");
    await expect(question.getAnimations()).toHaveLength(0);
  },
};

export const ProfileDesktop: Story = {
  ...Profile,
  tags: ["smoke"],
  globals: { viewport: { value: "desktop1280", isRotated: false } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const directory = c.getByRole("complementary", { name: "桌面题目目录" });
    await expect(directory).toBeVisible();
    await userEvent.click(within(directory).getByRole("button", { name: /一句话介绍/ }));
    await expect(c.getByPlaceholderText("比如：喜欢散步和独立电影，期待遇见能一起分享日常的人。")).toBeVisible();
    await userEvent.click(within(directory).getByRole("button", { name: /^希望遇见谁第 1 题/ }));
    await expect(within(directory).getByRole("button", { name: /^希望遇见谁第 1 题/ })).toHaveAttribute("aria-current", "step");
    await userEvent.click(within(directory).getByRole("button", { name: /^关于你第 1 题/ }));
    await expect(c.getByPlaceholderText("希望 TA 怎样称呼你")).toBeVisible();
    await document.fonts.ready;
    const footer = canvasElement.querySelector<HTMLElement>("footer[class*='moduleFooter']")!;
    const top = () => footer.getBoundingClientRect().top - canvasElement.getBoundingClientRect().top;
    const initialTop = top();
    for (const button of within(directory).getAllByRole("button")) {
      await userEvent.click(button);
      await expect(button).toHaveAttribute("aria-current", "step");
      await expect(Math.abs(top() - initialTop)).toBeLessThan(2);
    }
    await userEvent.click(within(directory).getByRole("button", { name: /^关于你第 1 题/ }));

  },
};

export const UserCenterDesktop: Story = {
  ...UserCenterFree,
  tags: ["smoke"],
  globals: { viewport: { value: "desktop1280", isRotated: false } },
  decorators: [(Story) => <PwaInstallProvider><Story /></PwaInstallProvider>],
};

export const ProfilePremiumLockedMobile: Story = { ...ProfilePremiumLocked, globals: { viewport: { value: "mobile390", isRotated: false } } };
export const ProfilePremiumActiveMobile: Story = { ...ProfilePremiumActive, globals: { viewport: { value: "mobile390", isRotated: false } } };

export const ProfileRetryingSave: Story = {
  ...Profile,
  tags: ["smoke"],
  parameters: { ...route("/dashboard/profile"), msw: { handlers: { profileSave: [
    http.put("/api/questionnaire", () => HttpResponse.json({ message: "Temporary outage" }, { status: 503 })),
    http.put(`${api}/me/questionnaire`, () => HttpResponse.json({ saveState: "DRAFT", questionnaireSubmittedAt: null, hasDraft: true })),
  ] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText("昵称", { exact: true }), "重试验收");
    await expect(await c.findByText("正在重试保存…", { exact: true }, { timeout: 3000 })).toBeVisible();
    await expect(c.queryByText("保存失败", { exact: true })).toBeNull();
    await expect(await c.findByText("草稿已自动保存", { exact: true }, { timeout: 5000 })).toBeVisible();
  },
};

const threeChoiceQuestions = [
  { key: "values", prompt: "请选择你最看重的 3 项价值。", labels: ["真诚", "尊重", "成长", "稳定", "自由"] },
  { key: "red_flag_sensitivity", prompt: '请选择你最在意的 3 个"雷点"。', labels: ["不尊重边界", "失信", "沟通回避", "控制欲", "情绪不稳定"] },
  { key: "shared_growth_topics", prompt: "如果长期相处，你更愿意一起投入哪 3 个方向？", labels: ["健康", "学习", "事业", "家庭", "兴趣"] },
  { key: "feeling_cared_for", prompt: "你最容易从哪 3 种行为里感到被在乎？", labels: ["认真倾听", "及时回应", "共同陪伴", "实际帮助", "尊重选择"] },
].map(q => ({ id: q.key, key: q.key, prompt: q.prompt, type: "MULTI_SELECT" as const, required: true, selectionLimit: 3, options: q.labels.map(label => ({ value: label, label })) }));

export const ProfileThreeChoices: Story = {
  ...Profile,
  tags: ["smoke"],
  parameters: ProfileLifestyle.parameters,
  render: () => <ProfileClient {...profileProps} initialQuestions={threeChoiceQuestions} />,
  play: async ({ canvasElement }) => {
    await jumpQuestion(canvasElement, threeChoiceQuestions[0].prompt);
    const c = within(within(canvasElement).getByRole("group", { name: threeChoiceQuestions[0].prompt }));
    await expect(c.getByText("本题必须选择 3 项。", { exact: true })).toBeVisible();
    await userEvent.click(c.getByText("真诚", { exact: true }));
    await userEvent.click(c.getByText("尊重", { exact: true }));
    await expect(c.getByRole("checkbox", { name: "尊重" })).toBeChecked();
  },
};

export const DashboardUnavailable: Story = {
  tags: ["smoke"],
  render: () => <DashboardError reset={() => {}} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "暂时无法加载" })).toBeVisible();
    await expect(c.getByRole("button", { name: "重新加载" })).toBeEnabled();
  },
};
