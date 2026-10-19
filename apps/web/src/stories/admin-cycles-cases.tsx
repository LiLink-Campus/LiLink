import { http, HttpResponse } from "msw";
import type { StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import Cycles from "@/app/admin/cycles/cycles-client";
import { route, json, failure, api } from "./site-support";
import { adminHandlers, page, cycleWorkbenchHandlers } from "./admin-handlers";
import { schoolGender } from "./admin-fixtures";
type Story = StoryObj;

export const CyclesPage: Story = {
  parameters: route("/admin/cycles"),
  render: () => <Cycles />,
};
export const CyclesPreviewAndFinal: Story = {
  tags: ["test"],
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
  tags: ["test"],
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
  tags: ["test"],
  ...CyclesPage,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const edit = await c.findByRole("button", { name: "编辑轮次" });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    const dialog = within(await c.findByRole("dialog", { name: "编辑轮次" }));
    await expect(dialog.getByRole("textbox", { name: "轮次代号" })).toHaveValue("春日相遇");
    await userEvent.click(dialog.getByRole("button", { name: "关闭编辑轮次" }));
    await expect(c.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
export const CyclesEmptyCreate: Story = {
  tags: ["test"],
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
  tags: ["test"],
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
  tags: ["test"],
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
let schoolStatisticsFail = true;
export const CyclesChartsRetry: Story = {
  tags: ["test"],
  ...CyclesPage,
  beforeEach: () => { schoolStatisticsFail = true; },
  parameters: {
    ...route("/admin/cycles"),
    msw: { handlers: { admin: [http.get(`${api}/admin/analytics/schools-gender`, () => schoolStatisticsFail
      ? HttpResponse.json({ message: "模拟服务暂时不可用" }, { status: 503 })
      : HttpResponse.json(schoolGender)), ...adminHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByRole("alert")).toHaveTextContent(/模拟服务暂时不可用/);
    await expect(await c.findByText("报名 72 人次")).toBeVisible();
    const retry = c.getByRole("button", { name: "重试学校统计" });
    await expect(retry).toBeEnabled();
    schoolStatisticsFail = false;
    await userEvent.click(retry);
    await expect(await c.findByRole("img", { name: /问卷完成率 92%/ })).toBeVisible();
    await expect(c.queryByRole("alert")).not.toBeInTheDocument();
    await expect(c.getByText("报名 72 人次")).toBeVisible();
    await expect(c.getByRole("tab", { name: "最终" })).toBeVisible();
  },
};
