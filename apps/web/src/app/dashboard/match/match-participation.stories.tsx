import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import { MatchClientView } from "./match-client";
import { matchDashboardFixtures, matchStoryUser } from "./match.fixtures";
import type { DashboardPayload } from "../_lib/types";

const initial = { ...matchDashboardFixtures.introducedContactCompleted,
  currentCycle: { ...matchDashboardFixtures.waitingNoResult.currentCycle!, status: "OPEN" as const, participationStatus: "OPTED_OUT" as const, intent: null },
};
let dashboard: DashboardPayload = structuredClone(initial);
let requests = 0;
const meta = {
  title: "Dashboard/Match/Current Participation",
  component: MatchClientView,
  tags: ["smoke"],
  parameters: { layout: "fullscreen", fixedNow: "2030-04-10T04:00:00.000Z", nextjs: { appDirectory: true, navigation: { pathname: "/dashboard/match" } },
    msw: { handlers: { site: null, participation: [
      http.put("http://localhost:4000/v1/me/participation", async ({ request }) => {
        requests++;
        const body = await request.json() as { optIn: boolean; intent: "DATE" | "FRIEND" | "BOTH" };
        dashboard = { ...dashboard, currentCycle: { ...dashboard.currentCycle!, participationStatus: "OPTED_IN", intent: body.intent } };
        return HttpResponse.json({ ok: true });
      }),
      http.get("http://localhost:4000/v1/me/dashboard", () => HttpResponse.json(dashboard)),
    ] } },
  },
  args: { initialNowMs: Date.parse("2030-04-10T04:00:00.000Z"), initialUser: matchStoryUser, initialDashboard: initial },
  beforeEach: () => { dashboard = structuredClone(initial); requests = 0; },
} satisfies Meta<typeof MatchClientView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const JoinKeepsPreviousResult: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "有一位同学，想认识你" })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "确认参与本轮" }));
    const dialog = within(c.getByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: /Both/ }));
    await expect(await c.findByText("本轮已参与")).toBeVisible();
    await expect(requests).toBe(1);
    await expect(c.getByRole("heading", { name: "有一位同学，想认识你" })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "查看上一轮结果 →" }));
    await expect(await c.findByText("chenyinuo_29")).toBeVisible();
    await expect(c.getByText("本轮已参与")).toBeVisible();
  },
};
export const RejectedParticipation: Story = {
  parameters: { msw: { handlers: { participation: [http.put("http://localhost:4000/v1/me/participation", () => HttpResponse.json({ message: "请先完善匹配资料" }, { status: 400 }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "确认参与本轮" }));
    await userEvent.click(within(c.getByRole("dialog")).getByRole("button", { name: /Both/ }));
    await expect(await c.findByText("请先完善匹配资料")).toBeVisible();
    await expect(c.queryByText("本轮已参与")).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: "查看上一轮结果 →" })).toBeVisible();
  },
};
export const ClosedWithPreviousResult: Story = {
  args: { initialDashboard: { ...initial, currentCycle: { ...initial.currentCycle, status: "PREPARING" } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText("本轮报名已截止")).toBeVisible();
    await expect(c.queryByRole("button", { name: "确认参与本轮" })).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: "查看上一轮结果 →" })).toBeVisible();
  },
};
