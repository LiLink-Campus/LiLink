import { http, HttpResponse } from "msw";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import Campaigns from "@/app/admin/campaigns/page";
import type { AdminCampaign } from "@/app/admin/types";
import { adminShell, api, route } from "./site-support";
import { adminHandlers, page } from "./admin-handlers";
import { campaign } from "./admin-fixtures";

let campaigns: AdminCampaign[] = [];
const handlers = [
  http.get(`${api}/admin/campaigns`, ({ request }) => {
    const query = new URL(request.url).searchParams;
    const status = query.get("status");
    const rows = campaigns.filter((item) => !status || item.status === status);
    const pageSize = Number(query.get("pageSize") ?? 20);
    return HttpResponse.json({ ...page(rows), items: rows.slice(0, pageSize) });
  }),
  http.patch(`${api}/admin/campaigns/:id`, async ({ params, request }) => {
    const input = (await request.json()) as { status: AdminCampaign["status"] };
    campaigns = campaigns.map((item) =>
      item.id === params.id ? { ...item, status: input.status } : item
    );
    return HttpResponse.json(campaigns.find((item) => item.id === params.id));
  }),
  ...adminHandlers,
];

const meta = {
  id: "campaign-conflict",
  title: "全站/运营后台/旧活动冲突",
  tags: ["smoke", "page"],
  decorators: [adminShell],
  parameters: {
    fullSite: true,
    ...route("/admin/campaigns"),
    msw: { handlers: { admin: handlers } },
  },
  beforeEach: () => {
    campaigns = [
      { ...campaign, id: "legacy-b", name: "旧活动 B", status: "ACTIVE", isDefault: true },
      { ...campaign, id: "legacy-a", name: "旧活动 A", status: "ACTIVE", isDefault: false },
      { ...campaign, id: "new-draft", name: "待发布活动", status: "DRAFT", isDefault: false },
    ];
  },
  render: () => <Campaigns />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Conflict: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("heading", { name: "需要确认当前活动" })).toBeVisible();
    await expect(c.getByRole("alert")).toHaveTextContent(
      "检测到 2 个进行中的历史活动，新增发券已暂停"
    );
    await userEvent.click(c.getByRole("button", { name: /待发布活动/ }));
    await expect(c.getByRole("button", { name: "请先结束当前活动" })).toBeDisabled();
    await userEvent.click(c.getByRole("button", { name: "查看待确认的活动" }));
    await expect(await c.findByRole("button", { name: "结束此活动" })).toBeVisible();
  },
};

export const ResolveConflict: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("heading", { name: "需要确认当前活动" })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: /旧活动 A/ }));
    const confirm = window.confirm;
    window.confirm = () => true;
    try {
      await userEvent.click(c.getByRole("button", { name: "结束此活动" }));
      await waitFor(() =>
        expect(c.queryByRole("heading", { name: "需要确认当前活动" })).not.toBeInTheDocument()
      );
      await expect(c.getByRole("heading", { name: "旧活动 B" })).toBeVisible();
      await expect(c.getByRole("button", { name: "结束活动" })).toBeVisible();
      await expect(c.getByText("活动已结束，保留优惠券与核销记录。")).toBeVisible();
    } finally {
      window.confirm = confirm;
    }
  },
};
