import { http, HttpResponse } from "msw";
import { LIFESTYLE_QUESTIONS } from "@lilink/shared";
import MatchLeads from "@/app/admin/match-leads/page";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import Overview from "@/app/admin/admin-overview-client";
import Users from "@/app/admin/users/page";
import Schools from "@/app/admin/schools/page";
import Cycles from "@/app/admin/cycles/page";
import Reports from "@/app/admin/reports/page";
import Audit from "@/app/admin/audit/page";
import Questionnaire from "@/app/admin/questionnaire/admin-questionnaire-client";
import Merchants from "@/app/admin/merchants/page";
import Campaigns from "@/app/admin/campaigns/page";
import Promotion from "@/app/admin/promotion/page";
import AdminLayoutShell from "@/app/admin/admin-layout-shell";
import { adminShell, route, visible, json, failure, api } from "./site-support";
import { adminHandlers, page, userAccountHandlers, cycleWorkbenchHandlers } from "./admin-handlers";
import { overview, adminQuestions, campaign } from "./admin-fixtures";
const meta = {
  id: "site-admin",
  title: "全站/运营后台",
  tags: ["smoke", "page"],
  decorators: [adminShell],
  parameters: { fullSite: true, ...route("/admin"), msw: { handlers: { admin: adminHandlers } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const OverviewPage: Story = {
  render: () => <Overview initialDashboard={overview} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "运营概览" })).toBeVisible();
    await expect(c.getByRole("button", { name: "生成测试用户", hidden: true })).not.toBeVisible();
    await userEvent.click(c.getByText("测试工具"));
    await expect(c.getByRole("button", { name: "生成测试用户" })).toBeVisible();
    await expect(c.queryByText("容量限制")).not.toBeInTheDocument();
    await expect(c.queryByRole("spinbutton", { name: "最大注册人数" })).not.toBeInTheDocument();
  },
};
export const UsersPage: Story = {
  parameters: route("/admin/users"),
  render: () => <Users />,
  play: visible("linhe@example.test"),
};
export const UsersEmpty: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: [json("/admin/users", page([])), ...adminHandlers] } },
  },
  play: visible(/没有|暂无/),
};
export const UsersError: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: [failure("/admin/users"), ...adminHandlers] } },
  },
  play: visible(/模拟服务暂时不可用/),
};

async function openUserAccount(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await userEvent.click(await c.findByRole("button", { name: /查看.*linhe@example.test/ }));
  const dialog = within(await c.findByRole("dialog", { name: "用户详情" }));
  await expect(await dialog.findByRole("region", { name: "账号管理" })).toBeVisible();
  await expect(
    dialog.queryByRole("button", { name: /^(正常|已停用|待激活|未启用)$/ })
  ).not.toBeInTheDocument();
  return dialog;
}

export const UserAccountNormal: Story = {
  ...UsersPage,
  play: async ({ canvasElement }) => {
    const dialog = await openUserAccount(canvasElement);
    await expect(dialog.getByLabelText("账号状态：正常")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "停用账号" })).toBeVisible();
    await expect(dialog.getByText(/注册完成后即为此状态，无需额外激活/)).toBeVisible();
  },
};
export const UserAccountSuspended: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: userAccountHandlers("SUSPENDED") } },
  },
  play: async ({ canvasElement }) => {
    const dialog = await openUserAccount(canvasElement);
    await expect(dialog.getByLabelText("账号状态：已停用")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "恢复账号" })).toBeVisible();
  },
};
export const UserAccountPending: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: userAccountHandlers("PENDING") } },
  },
  play: async ({ canvasElement }) => {
    const dialog = await openUserAccount(canvasElement);
    await expect(dialog.getByLabelText("账号状态：未启用")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "启用账号" })).toBeVisible();
  },
};
export const UserAccountStatusUpdate: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: userAccountHandlers("ACTIVE") } },
  },
  play: async ({ canvasElement }) => {
    const dialog = await openUserAccount(canvasElement);
    await userEvent.click(await dialog.findByRole("button", { name: "停用账号" }));
    await expect(await dialog.findByLabelText("账号状态：已停用")).toBeVisible();
    await expect(await dialog.findByRole("status")).toHaveTextContent("账号已停用。");
    await userEvent.click(dialog.getByRole("button", { name: "恢复账号" }));
    await expect(await dialog.findByLabelText("账号状态：正常")).toBeVisible();
    await expect(await dialog.findByRole("status")).toHaveTextContent("账号已恢复，可正常登录。");
  },
};
export const UserAccountEnable: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: userAccountHandlers("PENDING") } },
  },
  play: async ({ canvasElement }) => {
    const dialog = await openUserAccount(canvasElement);
    await userEvent.click(await dialog.findByRole("button", { name: "启用账号" }));
    await expect(await dialog.findByLabelText("账号状态：正常")).toBeVisible();
    await expect(await dialog.findByRole("status")).toHaveTextContent("账号已启用，可正常登录。");
  },
};
export const UserAccountStatusError: Story = {
  ...UsersPage,
  parameters: {
    ...route("/admin/users"),
    msw: { handlers: { admin: userAccountHandlers("ACTIVE", true) } },
  },
  play: async ({ canvasElement }) => {
    const dialog = await openUserAccount(canvasElement);
    await userEvent.click(await dialog.findByRole("button", { name: "停用账号" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent("模拟：账号状态更新失败。");
    await expect(dialog.getByLabelText("账号状态：正常")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "停用账号" })).toBeEnabled();
  },
};

export const SchoolsPage: Story = {
  parameters: route("/admin/schools"),
  render: () => <Schools />,
  play: visible("青禾大学"),
};
export const SchoolsEmpty: Story = {
  ...SchoolsPage,
  parameters: {
    ...route("/admin/schools"),
    msw: { handlers: { admin: [json("/admin/schools", page([])), ...adminHandlers] } },
  },
  play: visible(/没有|暂无/),
};
export const CyclesPage: Story = {
  parameters: route("/admin/cycles"),
  render: () => <Cycles />,
  play: visible("参与者与完成度"),
};
export const CyclesPreviewAndFinal: Story = {
  ...CyclesPage,
  parameters: { ...route("/admin/cycles"), msw: { handlers: { admin: cycleWorkbenchHandlers() } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText("林和 × 周宁")).toBeVisible();
    await expect(c.queryByRole("link", { name: "运营统计" })).not.toBeInTheDocument();
    await expect(c.queryByRole("heading", { name: /运行记录|执行记录/ })).not.toBeInTheDocument();
    await expect(c.getByRole("link", { name: /查看本轮审计/ })).toHaveAttribute(
      "href",
      expect.stringContaining("cycleId=cycle-story")
    );
    await userEvent.click(c.getByRole("tab", { name: "预演" }));
    await userEvent.click(c.getByRole("button", { name: "生成预演" }));
    await expect(await c.findByText(/18:15:30/)).toBeVisible();
    await expect(c.getByText("林和 × 陈一诺")).toBeVisible();
    await expect(c.queryByText("林和 × 周宁")).not.toBeInTheDocument();
    await userEvent.click(c.getByRole("button", { name: "重新预演" }));
    await expect(await c.findByText(/18:16:45/)).toBeVisible();
    await userEvent.click(c.getByRole("tab", { name: "最终" }));
    await expect(c.getByText("林和 × 周宁")).toBeVisible();
    await userEvent.click(c.getByRole("tab", { name: "预演" }));
    await expect(c.getByText(/18:16:45/)).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: /夏日相遇/ }));
    await userEvent.click(c.getByRole("tab", { name: "预演" }));
    await expect(c.queryByText(/18:16:45/)).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: "生成预演" })).toBeEnabled();
  },
};
export const CyclesMultiple: Story = {
  ...CyclesPage,
  parameters: { ...route("/admin/cycles"), msw: { handlers: { admin: cycleWorkbenchHandlers() } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const management = within(await c.findByRole("region", { name: "轮次管理" }));
    await expect(await management.findByRole("button", { name: /夏日相遇/ })).toBeVisible();
    await expect(management.getByRole("button", { name: /秋日来信/ })).toBeVisible();
    await expect(management.getByRole("button", { name: /冬日回声/ })).toBeVisible();
    await expect(management.getByRole("button", { name: "新建轮次" })).toBeVisible();
    await expect(management.getByRole("button", { name: "编辑轮次" })).toBeVisible();
    await userEvent.click(management.getByRole("button", { name: /秋日来信/ }));
    await expect(management.getByRole("button", { name: /秋日来信/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await userEvent.click(management.getByRole("button", { name: "编辑轮次" }));
    const dialog = within(await c.findByRole("dialog", { name: "编辑轮次" }));
    await expect(dialog.getByRole("textbox", { name: "轮次代号" })).toHaveValue("秋日来信");
    await userEvent.click(dialog.getByRole("button", { name: "关闭编辑轮次" }));
    await userEvent.click(management.getByRole("button", { name: "新建轮次" }));
    const create = within(await c.findByRole("dialog", { name: "新建轮次" }));
    await expect(create.getByRole("textbox", { name: "轮次代号" })).toHaveValue("");
  },
};
export const CyclesSettings: Story = {
  ...CyclesPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "编辑轮次" }));
    const dialog = within(await c.findByRole("dialog", { name: "编辑轮次" }));
    await expect(dialog.getByRole("textbox", { name: "轮次代号" })).toHaveValue("春日相遇");
    await userEvent.click(dialog.getByRole("button", { name: "关闭编辑轮次" }));
    await expect(c.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
export const CyclesEmptyCreate: Story = {
  ...CyclesPage,
  parameters: {
    ...route("/admin/cycles"),
    msw: { handlers: { admin: [json("/admin/cycles", page([])), ...adminHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "新建轮次" }));
    const dialog = within(await c.findByRole("dialog", { name: "新建轮次" }));
    await expect(dialog.getByRole("textbox", { name: "轮次代号" })).toHaveValue("");
  },
};
export const CyclesChartsOnly: Story = {
  ...CyclesPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("img", { name: /问卷完成率 92%/ })).toBeVisible();
    await expect(c.queryByText("参与者明细")).not.toBeInTheDocument();
    await expect(c.getByRole("button", { name: "强制重新执行" })).toBeVisible();
    await expect(c.queryByText("更多操作")).not.toBeInTheDocument();
  },
};
export const CyclesPreviewError: Story = {
  ...CyclesPage,
  parameters: {
    ...route("/admin/cycles"),
    msw: { handlers: { admin: [failure("/admin/cycles/:id/preview"), ...adminHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("tab", { name: "预演" }));
    await userEvent.click(c.getByRole("button", { name: "生成预演" }));
    await expect(await c.findByRole("alert")).toHaveTextContent(/模拟服务暂时不可用/);
    await expect(c.getByRole("button", { name: "生成预演" })).toBeEnabled();
  },
};
export const CyclesChartsRetry: Story = {
  ...CyclesPage,
  parameters: {
    ...route("/admin/cycles"),
    msw: { handlers: { admin: [failure("/admin/analytics/schools-gender"), ...adminHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("alert")).toHaveTextContent(/模拟服务暂时不可用/);
    await expect(c.getByRole("button", { name: "重试图表" })).toBeEnabled();
    await expect(c.getByRole("tab", { name: "最终" })).toBeVisible();
  },
};
export const ReportsPage: Story = {
  parameters: route("/admin/reports"),
  render: () => <Reports />,
  play: visible("不友善言行"),
};
export const ReportsEmpty: Story = {
  ...ReportsPage,
  parameters: {
    ...route("/admin/reports"),
    msw: { handlers: { admin: [json("/admin/reports", page([])), ...adminHandlers] } },
  },
  play: visible(/没有|暂无/),
};
export const AuditPage: Story = {
  parameters: route("/admin/audit"),
  render: () => <Audit />,
  play: visible("CYCLE_CREATED"),
};
export const QuestionnairePage: Story = {
  parameters: route("/admin/questionnaire"),
  render: () => <Questionnaire initialQuestions={adminQuestions} />,
  play: visible(adminQuestions[0].prompt),
};
export const MerchantsPage: Story = {
  parameters: route("/admin/merchants"),
  render: () => <Merchants />,
  play: visible("青禾咖啡"),
};
export const CampaignsPage: Story = {
  parameters: route("/admin/campaigns"),
  render: () => <Campaigns />,
  play: visible("活动列表"),
};
export const PromotionPage: Story = {
  parameters: route("/admin/promotion"),
  render: () => <Promotion />,
  play: visible("注册来源"),
};
export const PromotionLeaderboard: Story = {
  ...PromotionPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText("林和")).toBeVisible();
  },
};
export const CampaignResults: Story = {
  ...CampaignsPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "发放与核销" }));
    await expect(await c.findAllByText("青禾咖啡")).not.toHaveLength(0);
  },
};
export const LoginGate: Story = {
  parameters: { adminChrome: false },
  render: () => (
    <AdminLayoutShell initialAdmin={null} authChecked>
      <div />
    </AdminLayoutShell>
  ),
  play: visible("管理员邮箱"),
};
export const MerchantAccounts: Story = {
  ...MerchantsPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "管理核销账号" }));
    await expect(await c.findByText("clerk@example.test")).toBeVisible();
  },
};
export const CampaignTemplates: Story = {
  ...CampaignsPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect((await c.findAllByText("双人咖啡券"))[0]).toBeVisible();
  },
};
export const UserDetails: Story = {
  ...UsersPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: /林和.*linhe@example.test/ }));
    const dialog = await c.findByRole("dialog", { name: "用户详情" });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "编辑资料" }));
    await expect(within(dialog).getByRole("button", { name: "保存修改" })).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭用户详情" }));
    await expect(dialog).not.toBeVisible();
    await userEvent.click(c.getByRole("button", { name: /查看.*林和.*linhe@example.test/ }));
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(dialog).not.toBeVisible();
    await expect(c.getByRole("button", { name: /查看.*林和.*linhe@example.test/ })).toHaveFocus();
  },
};
export const SchoolEditor: Story = {
  ...SchoolsPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByTitle("编辑"));
    await expect(await c.findByDisplayValue("qinghe")).toBeVisible();
  },
};

export const OverviewEmpty: Story = {
  render: () => (
    <Overview
      initialDashboard={{
        metrics: { schools: 0, activeUsers: 0, completedQuestionnaires: 0, openReports: 0 },
        recentCycles: [],
        openReports: [],
      }}
    />
  ),
  play: visible("暂无进行中的轮次"),
};
export const OverviewError: Story = {
  parameters: { msw: { handlers: { admin: [failure("/admin/dashboard"), ...adminHandlers] } } },
  render: () => <Overview initialDashboard={null} />,
  play: visible(/模拟服务暂时不可用/),
};

export const MatchLeadsEmpty: Story = {
  parameters: {
    ...route("/admin/match-leads"),
    msw: { handlers: { admin: [json("/admin/match-leads", []), ...adminHandlers] } },
  },
  render: () => <MatchLeads />,
  play: visible("暂无登记"),
};
export const MatchLeadsError: Story = {
  ...MatchLeadsEmpty,
  parameters: {
    ...route("/admin/match-leads"),
    msw: { handlers: { admin: [failure("/admin/match-leads"), ...adminHandlers] } },
  },
  play: visible("加载失败，请重试。"),
};
export const MatchLeadsContacted: Story = {
  render: () => <MatchLeads />,
  parameters: {
    ...route("/admin/match-leads"),
    msw: {
      handlers: {
        admin: [
          json("/admin/match-leads", [
            {
              id: "lead-story",
              phone: "+6590000000",
              realName: "测试同学", school: "测试大学", major: "计算机科学", contact: "test_wechat", user: { id: "synthetic-user", email: "test@example.test", displayName: "测试同学" },
              contacted: true,
              createdAt: "2026-09-15T08:00:00Z",
            },
          ]),
          ...adminHandlers,
        ],
      },
    },
  },
  play: visible("标为待联系"),
};
function leadUpdateHandlers() {
  let contacted = false;
  return [
    http.get(`${api}/admin/match-leads`, () =>
      HttpResponse.json([
        { id: "lead-story", phone: "+6590000000",
              realName: "测试同学", school: "测试大学", major: "计算机科学", contact: "test_wechat", user: { id: "synthetic-user", email: "test@example.test", displayName: "测试同学" }, contacted, createdAt: "2026-09-15T08:00:00Z" },
      ])
    ),
    http.patch(`${api}/admin/match-leads/lead-story`, async ({ request }) => {
      const payload = (await request.json()) as { contacted: boolean };
      contacted = payload.contacted;
      return HttpResponse.json({ ok: true });
    }),
    ...adminHandlers,
  ];
}
export const MatchLeadsUpdate: Story = {
  render: () => <MatchLeads />,
  parameters: {
    ...route("/admin/match-leads"),
    msw: { handlers: { admin: leadUpdateHandlers() } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "标为已联系" }));
    await expect(await c.findByRole("button", { name: "标为待联系" })).toBeEnabled();
    await expect(c.getByText("已联系", { exact: true })).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "标为待联系" }));
    await expect(await c.findByRole("button", { name: "标为已联系" })).toBeEnabled();
  },
};

export const PromotionEmpty: Story = {
  ...PromotionPage,
  parameters: { ...route("/admin/promotion"), msw: { handlers: { admin: [json("/admin/promotion/acquisition", { shares: 0, visits: 0, registrations: 0, invitedRegistrations: 0, qualified: 0, channels: [], referrers: [] }), ...adminHandlers] } } },
  play: visible("暂无邀请注册记录。"),
};
export const CampaignCreate: Story = {
  ...CampaignsPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "新建活动" }));
    const dialog = c.getByRole("dialog", { name: "新建活动" });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByRole("textbox", { name: "活动名称" })).toBeVisible();
    await expect(within(dialog).queryByText(/slug|默认活动/)).not.toBeInTheDocument();
  },
};
export const MerchantCreate: Story = {
  ...MerchantsPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: "新增商家" }));
    await expect(c.getByRole("dialog", { name: "新增商家" })).toBeVisible();
  },
};

export const CampaignDraft: Story = {
  ...CampaignsPage,
  parameters: {
    ...route("/admin/campaigns"),
    msw: { handlers: { admin: [http.get(`${api}/admin/campaigns`, ({ request }) => HttpResponse.json(page(new URL(request.url).searchParams.get("status") === "ACTIVE" ? [] : [{ ...campaign, status: "DRAFT", isDefault: false }]))), ...adminHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("button", { name: "发布活动" })).toBeEnabled();
    await expect(await c.findByRole("combobox", { name: "合作商家" })).toBeVisible();
    await expect(c.queryByText("设为默认活动")).not.toBeInTheDocument();
  },
};

const smokingQuestion = {
  ...adminQuestions[0], id: "smoking-contract", key: "smoking_status", prompt: "吸烟情况",
  type: "SINGLE_SELECT" as const, order: 1, weight: 0,
  options: LIFESTYLE_QUESTIONS[1].options.map(value => ({ value, label: value })),
};
export const LifestyleQuestionContract: Story = {
  parameters: {
    ...route("/admin/questionnaire"),
    msw: { handlers: { admin: [
      json("/admin/questionnaire", { id: "contract", questions: [smokingQuestion] }),
      http.put(`${api}/admin/questionnaire/questions`, async ({ request }) => {
        const body = await request.json() as { type: string; weight: number; options: { value: string; label: string }[] };
        if (body.type !== "SINGLE_SELECT" || body.weight !== 0 || body.options[0]?.value !== "不吸烟" || body.options[0]?.label !== "从不吸烟") {
          return HttpResponse.json({ message: "匹配选项值或权重被意外修改" }, { status: 400 });
        }
        return HttpResponse.json({ ok: true });
      }),
      ...adminHandlers,
    ] } },
  },
  render: () => <Questionnaire initialQuestions={[smokingQuestion]} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByTitle("删除")).toBeDisabled();
    await userEvent.click(c.getByTitle("编辑"));
    await expect(c.getByRole("combobox", { name: "题型" })).toBeDisabled();
    await expect(c.getByRole("button", { name: "+ 添加选项" })).toBeDisabled();
    await expect(c.queryByTitle("移除选项")).not.toBeInTheDocument();
    await expect(c.getByRole("spinbutton", { name: "权重" })).toHaveValue(0);
    const option = c.getAllByPlaceholderText("选项文案")[0];
    await userEvent.clear(option);
    await userEvent.type(option, "从不吸烟");
    await userEvent.click(c.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(c.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument());
    await expect(c.queryByRole("alert")).not.toBeInTheDocument();
  },
};
const exactQuestion = { ...adminQuestions[0], id: "exact-contract", type: "MULTI_SELECT" as const, order: 1, selectionLimit: 2 };
export const ExactSelectionContract: Story = {
  parameters: { ...route("/admin/questionnaire"), msw: { handlers: { admin: [json("/admin/questionnaire", { id: "contract", questions: [exactQuestion] }), ...adminHandlers] } } },
  render: () => <Questionnaire initialQuestions={[exactQuestion]} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText(/必须选择 2 项/)).toBeVisible();
    await userEvent.click(c.getByTitle("编辑"));
    await userEvent.click(c.getByRole("button", { name: /高级设置/ }));
    await expect(c.getByRole("spinbutton", { name: "必须选择的项数" })).toHaveValue(2);
  },
};

export const LifestyleQuestionEditor: Story = {
  ...LifestyleQuestionContract,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTitle("编辑"));
  },
};
export const NewLifestyleQuestion: Story = {
  parameters: { ...route("/admin/questionnaire"), msw: { handlers: { admin: [json("/admin/questionnaire", { id: "contract", questions: [] }), ...adminHandlers] } } },
  render: () => <Questionnaire initialQuestions={[]} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /添加题目/ }));
    await userEvent.type(c.getByRole("textbox", { name: "题目 Key" }), "smoking_status");
    await expect(c.getAllByPlaceholderText("选项文案")).toHaveLength(4);
    await expect(c.getAllByPlaceholderText("选项文案")[0]).toHaveValue("不吸烟");
    await expect(c.getByRole("combobox", { name: "题型" })).toBeDisabled();
    await userEvent.click(c.getByRole("button", { name: /高级设置/ }));
    await expect(c.getByRole("spinbutton", { name: "权重" })).toHaveValue(0);
  },
};
