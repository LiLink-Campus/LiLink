import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { delay, http, HttpResponse } from "msw";
import { ProfileClient } from "@/app/dashboard/profile/profile-client";
import type { Question } from "@/app/dashboard/_lib/types";
import { matchDashboardFixtures, matchStoryUser } from "@/app/dashboard/match/match.fixtures";
import { hardMatchFormFromAnswers } from "@lilink/shared";
import questionnaire from "../../../api/prisma/fixtures/autumn-20260920-questionnaire.json";
import { contacts, now, savedProfile, schools } from "./site-fixtures";
import { api, dashboardShell, route } from "./site-support";

const questions: Question[] = questionnaire.questions.map(question => ({
  id: `compact-preview-${question.key}`,
  key: question.key,
  prompt: question.prompt,
  type: question.type as Question["type"],
  required: question.required,
  selectionLimit: question.selectionLimit,
  options: question.options,
}));
const answers = {
  ...savedProfile.answers,
  hard_looks: "5",
  ...Object.fromEntries(questions.map(question => [question.key,
    question.type === "MULTI_SELECT"
      ? question.options!.slice(0, question.selectionLimit || 1).map(option => option.value)
      : question.options![0].value,
  ])),
  social_energy: "比较不像我",
};
const meta = {
  id: "profile-compact",
  title: "资料/紧凑答题",
  component: ProfileClient,
  tags: ["smoke", "page"],
  decorators: [dashboardShell],
  parameters: { fullSite: true, ...route("/dashboard/profile") },
  args: {
    initialUser: matchStoryUser,
    initialDashboard: matchDashboardFixtures.waitingNoResult,
    initialQuestions: questions,
    initialSchools: schools.schools,
    initialContactPreferences: contacts,
    initialSavedQuestionnaire: { ...savedProfile, answers },
  },
} satisfies Meta<typeof ProfileClient>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openExampleQuestion(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await c.findByRole("region", { name: "当前题目" });
  const directory = c.queryByRole("complementary", { name: "桌面题目目录" });
  if (directory) {
    await userEvent.click(within(directory).getByRole("button", { name: /题：熟起来以后/ }));
  } else {
    await userEvent.click(c.getByRole("button", { name: "题目目录" }));
    await userEvent.click(within(c.getByRole("dialog", { name: "题目目录" })).getByRole("button", { name: /题：熟起来以后/ }));
  }
}

async function editExampleAnswer(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await openExampleQuestion(canvasElement);
  await userEvent.click(c.getByRole("radio", { name: "看情况" }));
  await c.findByRole("group", { name: "在关系里，我愿意把自己的真实情绪直接说出来。" });
  await openExampleQuestion(canvasElement);
}

export const FiveChoices: Story = {
  globals: { viewport: { value: "mobileShort", isRotated: false } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await openExampleQuestion(canvasElement);
    await expect(c.getByRole("radio", { name: "比较不像我" })).toBeChecked();
    await canvasElement.ownerDocument.fonts.ready;
    await waitFor(() => {
      const reader = c.getByRole("region", { name: "当前题目" });
      const last = c.getByRole("radio", { name: "非常像我" }).closest("label")!;
      // Very short windows and enlarged text retain scrolling as a fallback.
      if (window.innerHeight >= 640 && window.innerWidth >= 360 && window.innerWidth < 880) {
        expect(last.getBoundingClientRect().bottom).toBeLessThanOrEqual(reader.getBoundingClientRect().bottom);
        expect(reader.scrollHeight - reader.clientHeight).toBeLessThanOrEqual(1);
        expect(c.getByText("↓ 下方还有内容")).not.toBeVisible();
      }
    });
  },
};

export const Desktop: Story = {
  ...FiveChoices,
  globals: { viewport: { value: "desktop1280", isRotated: false } },
};

const savedResponse = () => HttpResponse.json({ saveState: "SUBMITTED", questionnaireSubmittedAt: now, hasDraft: false });
const slowSave = async () => { await delay(8000); return savedResponse(); };

export const Saving: Story = {
  ...FiveChoices,
  name: "正在保存",
  parameters: { msw: { handlers: { profileSave: [http.put("/api/questionnaire", slowSave), http.put(`${api}/me/questionnaire`, slowSave)] } } },
  play: async ({ canvasElement }) => {
    await editExampleAnswer(canvasElement);
    const label = window.innerWidth < 880 ? "保存中…" : "正在保存…";
    await expect(await within(canvasElement).findByText(label, { exact: true })).toBeVisible();
  },
};

let saveAttempt = 0;
const failThenSave = async () => {
  await delay(800);
  return saveAttempt++ === 0
    ? HttpResponse.json({ message: "模拟保存失败" }, { status: 400 })
    : savedResponse();
};

export const SaveFailure: Story = {
  ...FiveChoices,
  name: "保存失败（可重试）",
  beforeEach: () => { saveAttempt = 0; },
  parameters: { msw: { handlers: { profileSave: [http.put("/api/questionnaire", failThenSave), http.put(`${api}/me/questionnaire`, failThenSave)] } } },
  play: async ({ canvasElement }) => {
    await editExampleAnswer(canvasElement);
    await expect(await within(canvasElement).findByRole("button", { name: "重试保存" }, { timeout: 5000 })).toBeVisible();
  },
};

export const DraftSaved: Story = {
  ...FiveChoices,
  name: "草稿已保存",
  args: {
    initialSavedQuestionnaire: {
      ...savedProfile,
      answers,
      draft: {
        displayName: matchStoryUser.displayName!,
        hardMatchForm: hardMatchFormFromAnswers({ ...answers, hard_one_liner_intro: "" }, schools.schools),
        softAnswers: answers,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await openExampleQuestion(canvasElement);
    const label = window.innerWidth < 880 ? "草稿已保存" : "草稿已自动保存";
    await expect(within(canvasElement).getByText(label, { exact: true })).toBeVisible();
  },
};
