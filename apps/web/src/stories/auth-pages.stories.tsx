import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { http, HttpResponse } from "msw";
import Login from "@/app/login/login-page-client";
import Chooser from "@/app/register/register-chooser-client";
import School from "@/app/register/register-school-client";
import Personal from "@/app/register/register-personal-client";
import Forgot from "@/app/forgot-password/forgot-password-page-client";
import { api, failure, guest, publicShell, route, visible } from "./site-support";
import { schools } from "./site-fixtures";

const codes = [
  http.post(`${api}/auth/request-code`, () =>
    HttpResponse.json({ ok: true, registrationMode: "SCHOOL_EMAIL", school: schools.schools[0] })
  ),
  http.post(`${api}/auth/request-password-reset-code`, () => HttpResponse.json({ ok: true })),
];
const meta = {
  id: "site-auth",
  title: "全站/账号流程",
  tags: ["smoke", "page"],
  decorators: [publicShell],
  parameters: { fullSite: true, msw: { handlers: { session: [guest], auth: codes } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
async function verification(canvasElement: HTMLElement, label: string) {
  const c = within(canvasElement);
  if (label === "普通邮箱") await userEvent.type(c.getByLabelText("邀请码"), "3E4V87GBP2");
  await userEvent.type(
    c.getByLabelText(label),
    label === "学校邮箱" ? "student@qinghe.example.edu" : "student@example.test"
  );
  await userEvent.click(c.getByRole("button", { name: "发送验证码" }));
  await expect(await c.findByText(/验证码已发送/)).toBeVisible();
  await userEvent.type(c.getByLabelText("验证码"), "123456");
  await userEvent.click(c.getByRole("button", { name: "下一步" }));
}
export const LoginPage: Story = {
  parameters: route("/login"),
  render: () => <Login />,
  play: visible("欢迎回来"),
};
export const LoginError: Story = {
  ...LoginPage,
  parameters: { ...route("/login"), msw: { handlers: { auth: [failure("/auth/login", "post")] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText("邮箱"), "student@example.test");
    await userEvent.type(c.getByLabelText("密码"), "StoryPassword123!");
    await userEvent.click(c.getByRole("button", { name: "登录" }));
    await expect(await c.findByText(/模拟服务暂时不可用/)).toHaveTextContent("模拟服务暂时不可用");
  },
};
export const RegisterChooser: Story = {
  parameters: route("/register"),
  render: () => <Chooser />,
  play: visible(/学校邮箱/),
};
export const SchoolEmail: Story = {
  parameters: route("/register/school"),
  render: () => <School />,
  play: visible("学校邮箱"),
};
export const SchoolPassword: Story = {
  ...SchoolEmail,
  play: async ({ canvasElement }) => {
    await verification(canvasElement, "学校邮箱");
    await expect(within(canvasElement).getByLabelText("确认密码")).toBeVisible();
  },
};
export const SchoolCodeError: Story = {
  ...SchoolEmail,
  parameters: {
    ...route("/register/school"),
    msw: { handlers: { auth: [failure("/auth/request-code", "post")] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText("学校邮箱"), "student@qinghe.example.edu");
    await userEvent.click(c.getByRole("button", { name: "发送验证码" }));
    await expect(await c.findByText(/模拟服务暂时不可用/)).toHaveTextContent("模拟服务暂时不可用");
  },
};
export const PersonalEmail: Story = {
  parameters: route("/register/personal"),
  render: () => <Personal />,
  play: visible("普通邮箱"),
};
export const PersonalPassword: Story = {
  ...PersonalEmail,
  play: async ({ canvasElement }) => {
    await verification(canvasElement, "普通邮箱");
    await expect(within(canvasElement).getByLabelText("确认密码")).toBeVisible();
  },
};
export const ResetEmail: Story = {
  parameters: route("/forgot-password"),
  render: () => <Forgot />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByLabelText("注册邮箱")).toHaveValue("");
    await expect(c.getByLabelText("注册邮箱")).toBeEnabled();
    await expect(c.getByRole("link", { name: "返回登录" })).toHaveAttribute("href", "/login");
  },
};
export const ResetPassword: Story = {
  ...ResetEmail,
  play: async ({ canvasElement }) => {
    await verification(canvasElement, "注册邮箱");
    await expect(within(canvasElement).getByLabelText("确认新密码")).toBeVisible();
  },
};

async function legalReturn(canvasElement: HTMLElement, label: string) {
  await verification(canvasElement, label);
  const c = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.type(c.getByLabelText("密码", { exact: true }), "PreviewPassword123");
  await userEvent.type(c.getByLabelText("确认密码"), "PreviewPassword123");
  for (const title of ["用户协议", "隐私政策"]) {
    await userEvent.click(c.getByRole("link", { name: title }));
    const dialog = await body.findByRole("dialog", { name: title });
    await expect(within(dialog).getByRole("heading", { name: title })).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭弹窗" }));
    await waitFor(() => expect(dialog).not.toBeVisible());
    await expect(await c.findByLabelText("确认密码")).toHaveValue("PreviewPassword123");
    await expect(c.getByRole("checkbox")).not.toBeChecked();
  }
}

export const SchoolLegalReturn: Story = {
  ...SchoolEmail,
  play: async ({ canvasElement }) => legalReturn(canvasElement, "学校邮箱"),
};

export const PersonalLegalReturn: Story = {
  ...PersonalPassword,
  play: async ({ canvasElement }) => legalReturn(canvasElement, "普通邮箱"),
};

export const ResetSignedIn: Story = {
  ...ResetEmail,
  render: () => <Forgot initialEmail="demo@school.example" />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByLabelText("注册邮箱")).toHaveValue("demo@school.example");
    await expect(c.getByLabelText("注册邮箱")).toBeDisabled();
    await expect(c.getByRole("link", { name: "← 返回用户中心" })).toHaveAttribute("href", "/dashboard/me");
    await expect(c.queryByRole("link", { name: "返回登录" })).toBeNull();
    await userEvent.click(c.getByRole("button", { name: "发送验证码" }));
    await waitFor(() => expect(c.getByText("验证码已发送，请检查收件箱或垃圾邮件。")).toBeVisible());
    await userEvent.type(c.getByLabelText("验证码"), "123456");
    await userEvent.click(c.getByRole("button", { name: "下一步" }));
    await expect(c.getByLabelText("确认新密码")).toBeVisible();
    await expect(c.getByRole("link", { name: "← 返回用户中心" })).toHaveAttribute("href", "/dashboard/me");
  },
};
