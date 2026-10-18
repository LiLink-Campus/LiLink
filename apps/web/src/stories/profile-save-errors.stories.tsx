import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import { ProfileClient } from "@/app/dashboard/profile/profile-client";
import { profileProps } from "./dashboard-bootstrap-fixtures";
import { api, dashboardShell, route, siteHandlers } from "./site-support";

const user = { ...profileProps.initialUser, displayName: "短" };
const meta = {
  id: "profile-save-errors",
  title: "Dashboard/Profile/Save error previews",
  component: ProfileClient,
  tags: ["!test"],
  decorators: [dashboardShell],
  args: { ...profileProps, initialUser: user },
  parameters: {
    layout: "fullscreen",
    ...route("/dashboard/profile"),
    msw: { handlers: {
      session: [http.get(`${api}/auth/me`, () => HttpResponse.json(user))],
    } },
  },
} satisfies Meta<typeof ProfileClient>;
export default meta;
type Story = StoryObj<typeof meta>;

function rejected(message: string) {
  return { msw: { handlers: { site: [
    http.put("*/api/questionnaire", () => HttpResponse.json({ message }, { status: 400 })),
    http.put(`${api}/me/questionnaire`, () => HttpResponse.json({ message }, { status: 400 })),
    ...siteHandlers,
  ] } } };
}

async function editIntro({ canvasElement }: { canvasElement: HTMLElement }) {
  const c = within(canvasElement);
  const directory = c.queryByRole("button", { name: "题目目录" });
  if (directory?.checkVisibility()) await userEvent.click(directory);
  await userEvent.click(c.getByRole("button", { name: /关于你第 \d+ 题：一句话介绍$/ }));
  await userEvent.type(c.getByRole("textbox", { name: /一句话介绍/ }), "喜欢散步和看展，希望认识有趣的同学。");
}

export const NicknameBlocksIntro: Story = {
  parameters: rejected("displayName must be longer than or equal to 2 characters"),
  play: editIntro,
};
export const IntroRejected: Story = {
  args: { initialUser: { ...user, displayName: "演示同学" } },
  parameters: rejected("一句话介绍请不要超过 200 字。"),
  play: editIntro,
};
