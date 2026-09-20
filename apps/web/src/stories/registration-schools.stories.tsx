import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { delay, http, HttpResponse } from "msw";
import School from "@/app/register/register-school-client";
import Personal from "@/app/register/register-personal-client";
import type { EligibleSchoolsPayload } from "@/lib/eligible-schools";
import { api, guest, publicShell, route, siteHandlers } from "./site-support";
import { schools } from "./site-fixtures";

const updatedSchools: EligibleSchoolsPayload = {
  schools: [
    {
      id: "school-story-new",
      name: "新桥大学",
      description: null,
      domains: ["xinqiao.example.edu"],
    },
  ],
  totalSchoolCount: 1,
  totalDomainCount: 1,
  generatedAt: "2026-09-12T00:00:00Z",
};
let currentSchools = schools;
let shouldFail = false;
let requestCount = 0;
const schoolHandler = http.get(`${api}/public/schools`, () => {
  requestCount += 1;
  return shouldFail
    ? HttpResponse.json({ message: "Synthetic unavailable" }, { status: 503 })
    : HttpResponse.json(currentSchools);
});

const meta = {
  id: "registration-schools",
  title: "全站/注册学校列表",
  tags: ["smoke", "page"],
  decorators: [publicShell],
  render: () => <School />,
  parameters: {
    ...route("/register/school"),
    fullSite: true,
    msw: { handlers: { session: [guest], site: [schoolHandler, ...siteHandlers] } },
  },
  beforeEach: () => {
    currentSchools = schools;
    shouldFail = false;
    requestCount = 0;
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

async function openDialog(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "查看支持的学校" }));
  return within(canvas.getByRole("dialog", { name: "支持的学校" }));
}

export const RefreshOnReopen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("学校邮箱"), "student@qinghe.example.edu");
    await expect(await canvas.findByText(`✓ ${schools.schools[0].name}`)).toBeVisible();
    let dialog = await openDialog(canvasElement);
    await expect(await dialog.findByText(schools.schools[0].name)).toBeVisible();
    const searchbox = dialog.getByRole("searchbox");
    for (const key of ["Enter", "Escape"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        isComposing: true,
      });
      expect(searchbox.dispatchEvent(event)).toBe(true);
    }
    await expect(canvas.getByRole("dialog", { name: "支持的学校" })).toBeVisible();
    await userEvent.type(dialog.getByRole("searchbox"), "qinghe.example.edu");
    await expect(dialog.getByText(schools.schools[0].name)).toBeVisible();
    await expect(dialog.queryByText(schools.schools[1].name)).not.toBeInTheDocument();
    await userEvent.clear(dialog.getByRole("searchbox"));
    await userEvent.type(dialog.getByRole("searchbox"), "no-such-school");
    await expect(dialog.getByText(/没有找到相关学校/)).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "关闭学校列表" }));

    currentSchools = updatedSchools;
    dialog = await openDialog(canvasElement);
    await expect(await dialog.findByText("新桥大学")).toBeVisible();
    await expect(dialog.queryByText(schools.schools[0].name)).not.toBeInTheDocument();
    await expect(dialog.getByRole("searchbox")).toHaveValue("");
    await userEvent.click(dialog.getByRole("button", { name: "关闭学校列表" }));
    await userEvent.clear(canvas.getByLabelText("学校邮箱"));
    await userEvent.type(canvas.getByLabelText("学校邮箱"), "student@xinqiao.example.edu");
    await expect(await canvas.findByText("✓ 新桥大学")).toBeVisible();
    dialog = await openDialog(canvasElement);
    await expect(await dialog.findByText("新桥大学")).toBeVisible();
    await expect(requestCount).toBeGreaterThanOrEqual(4);
  },
};

export const FailureWithRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("学校邮箱"), "student@qinghe.example.edu");
    await expect(await canvas.findByText(`✓ ${schools.schools[0].name}`)).toBeVisible();
    shouldFail = true;
    const dialog = await openDialog(canvasElement);
    await expect(await dialog.findByRole("alert")).toHaveTextContent("学校列表加载失败");
    await expect(dialog.queryByText(schools.schools[0].name)).not.toBeInTheDocument();
    shouldFail = false;
    currentSchools = updatedSchools;
    const retry = dialog.getByRole("button", { name: "重试加载学校列表" });
    retry.focus();
    await userEvent.keyboard("{Enter}");
    await expect(await dialog.findByText("新桥大学")).toBeVisible();
  },
};

export const InitialFailure: Story = {
  beforeEach: () => {
    shouldFail = true;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("暂时无法核对邮箱后缀")).toBeVisible());
    const dialog = await openDialog(canvasElement);
    await expect(await dialog.findByRole("alert")).toHaveTextContent("学校列表加载失败");
    await expect(dialog.getByRole("button", { name: "重试加载学校列表" })).toBeEnabled();
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: {
        site: [
          http.get(`${api}/public/schools`, async () => {
            await delay("infinite");
            return HttpResponse.json(schools);
          }),
          ...siteHandlers,
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("学校邮箱"), "student@qinghe.example.edu");
    await expect(canvas.queryByText("暂不支持此邮箱后缀")).not.toBeInTheDocument();
    const dialog = await openDialog(canvasElement);
    await expect(dialog.getByText("正在加载最新学校列表…")).toBeVisible();
    await expect(dialog.queryByText(/没有找到相关学校/)).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  beforeEach: () => {
    currentSchools = { ...updatedSchools, schools: [], totalDomainCount: 0, totalSchoolCount: 0 };
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement);
    await waitFor(() =>
      expect(dialog.getByText("目前暂无支持学校邮箱注册的学校，请稍后再试。")).toBeVisible()
    );
    await expect(dialog.queryByText(/没有找到相关学校/)).not.toBeInTheDocument();
  },
};

export const NewRequestWins: Story = {
  parameters: {
    msw: {
      handlers: {
        site: [
          http.get(`${api}/public/schools`, async () => {
            requestCount += 1;
            if (requestCount === 1) {
              await delay(400);
              return HttpResponse.json(schools);
            }
            return HttpResponse.json(updatedSchools);
          }),
          ...siteHandlers,
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(requestCount).toBe(1));
    const dialog = await openDialog(canvasElement);
    await waitFor(() => expect(dialog.getByText("新桥大学")).toBeVisible());
    await new Promise((resolve) => setTimeout(resolve, 450));
    await expect(dialog.getByText("新桥大学")).toBeVisible();
    await expect(dialog.queryByText(schools.schools[0].name)).not.toBeInTheDocument();
  },
};

export const PersonalSchoolRefresh: Story = {
  render: () => <Personal />,
  parameters: {
    ...route("/register/personal"),
    msw: {
      handlers: {
        auth: [http.post(`${api}/auth/request-code`, () => HttpResponse.json({ ok: true }))],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("邀请码"), "SYNTHETIC1");
    await userEvent.type(canvas.getByLabelText("普通邮箱"), "student@example.test");
    await userEvent.click(canvas.getByRole("button", { name: "发送验证码" }));
    await expect(await canvas.findByText(/验证码已发送/)).toBeVisible();
    await userEvent.type(canvas.getByLabelText("验证码"), "123456");
    await userEvent.click(canvas.getByRole("button", { name: "下一步" }));
    await expect(
      await canvas.findByRole("option", { name: schools.schools[0].name })
    ).toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByRole("combobox"), schools.schools[0].id);
    await userEvent.click(canvas.getByRole("button", { name: "返回上一步" }));
    currentSchools = updatedSchools;
    await userEvent.click(canvas.getByRole("button", { name: "下一步" }));
    await expect(await canvas.findByRole("option", { name: "新桥大学" })).toBeInTheDocument();
    await expect(canvas.getByRole("combobox")).toHaveValue("");
    await expect(
      canvas.queryByRole("option", { name: schools.schools[0].name })
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByRole("combobox"), "school-story-new");
    await expect(canvas.getByRole("combobox")).toHaveValue("school-story-new");
  },
};
