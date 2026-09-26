import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import { ProfileBootstrap } from "@/app/dashboard/profile/profile-bootstrap";
import { beginProfileWrite, setProfileReadAccount } from "@/app/dashboard/_lib/profile-read-revision";
import { profilePageData } from "./dashboard-bootstrap-fixtures";
import { api, dashboardShell, route, siteHandlers } from "./site-support";

let reads = 0;
const refreshed = { ...profilePageData, user: { ...profilePageData.user, displayName: "重新读取的昵称" } };
const meta = {
  title: "全站/资料同步",
  component: ProfileBootstrap,
  tags: ["smoke", "page"],
  decorators: [dashboardShell],
  parameters: {
    fullSite: true,
    ...route("/dashboard/profile"),
    msw: { handlers: { session: [http.get(`${api}/auth/me`, () => HttpResponse.json(profilePageData.user))], site: [
      http.get(`${api}/me/page-bootstrap/profile`, () => ++reads === 1
        ? HttpResponse.json({ message: "最新资料暂时不可用，请重试。" }, { status: 503 })
        : HttpResponse.json(refreshed)),
      ...siteHandlers,
    ] } },
  },
  beforeEach: () => {
    reads = 0;
    setProfileReadAccount(null);
    setProfileReadAccount(profilePageData.user.id);
    const write = beginProfileWrite(profilePageData.user.id, Symbol("previous-page"));
    write.succeeded();
    write.finish();
    return () => setProfileReadAccount(null);
  },
} satisfies Meta<typeof ProfileBootstrap>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RetryLatestProfile: Story = {
  args: { initialData: profilePageData },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("最新资料暂时不可用，请重试。");
    await expect(canvas.queryByRole("textbox", { name: "昵称" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "重试加载最新资料" }));
    await expect(await canvas.findByRole("textbox", { name: "昵称" })).toHaveValue("重新读取的昵称");
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
