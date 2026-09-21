import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, within } from "storybook/test";
import { CommunityStats } from "./community-stats";

const session = http.get("http://localhost:4000/v1/auth/me", () => HttpResponse.json({ user: null }));

const fixture = {
  total: 42, genders: { male: 18, female: 19, nonBinary: 3, unknown: 2 },
  schools: [
    { id: "a", name: "示例大学甲", count: 25 },
    { id: "b", name: "示例大学乙国际联合学院（用于验证长名称换行）", count: 15 },
    { id: null, name: "未关联学校", count: 2 },
  ],
  generatedAt: "2026-09-17T10:00:00.000Z",
};
const meta = {
  title: "Marketing/CommunityStats", component: CommunityStats, tags: ["smoke"],
  parameters: { layout: "fullscreen", msw: { handlers: [session, http.get("*/api/public/community", () => HttpResponse.json(fixture))] } },
} satisfies Meta<typeof CommunityStats>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("list", { name: "各学校已加入人数" })).toBeVisible();
    await expect(c.getByText("非二元", { exact: true })).toBeVisible();
    await expect(c.getByRole("img", { name: /男 18 人/ })).toBeVisible();
  },
};
export const AllSchools: Story = {
  parameters: { msw: { handlers: [session, http.get("*/api/public/community", () => HttpResponse.json({
    ...fixture,
    schools: Array.from({ length: 11 }, (_, index) => ({
      id: `school-${index}`, name: `示例大学 ${index + 1}`, count: index === 0 ? 42 : 0,
    })),
  }))] } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const list = await c.findByRole("list", { name: "各学校已加入人数" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(11);
    await expect(c.getByText("示例大学 11", { exact: false })).toBeVisible();
  },
};
export const Empty: Story = {
  parameters: { msw: { handlers: [session, http.get("*/api/public/community", () => HttpResponse.json({ ...fixture, total: 0, genders: { male: 0, female: 0, nonBinary: 0, unknown: 0 }, schools: [] }))] } },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("暂无同学加入")).toBeVisible(); },
};
export const Unavailable: Story = {
  parameters: { msw: { handlers: [session, http.get("*/api/public/community", () => new HttpResponse(null, { status: 503 }))] } },
  play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("人数统计暂时不可用，稍后自动重试")).toBeVisible(); },
};
