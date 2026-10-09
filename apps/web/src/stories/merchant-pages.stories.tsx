import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import Login from "@/app/merchant/login/page";
import Redeem from "@/app/merchant/redeem/page";
import Scan from "@/app/r/[code]/page";
import { RedeemConfirm } from "@/app/merchant/_components/RedeemConfirm";
import { api, failure, route, visible, siteHandlers, publicShell } from "./site-support";
import { prepare } from "./site-fixtures";
const meta = {
  tags: ["!test"],
  id: "site-merchant",
  title: "全站/商家核销",
  parameters: { fullSite: true },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const LoginPage: Story = {
  tags: ["test"],
  decorators: [publicShell],
  parameters: route("/merchant/login"),
  render: () => <Login />,
  play: visible("商家核销登录"),
};
export const ManualEntry: Story = {
  decorators: [publicShell],
  parameters: route("/merchant/redeem"),
  render: () => <Redeem />,
};
async function enterCode(canvasElement: HTMLElement) {
  const c = within(canvasElement);
  await userEvent.type(
    await c.findByPlaceholderText("输入核销码（格式：券码-验证码）"),
    "AB23CD-123456"
  );
  await userEvent.click(c.getByRole("button", { name: /查询|下一步|核验/ }));
}

export const ManualSuccess: Story = {
  tags: ["test"],
  ...ManualEntry,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(await c.findByText(/店员小禾|青禾咖啡/)).toBeVisible();
    await enterCode(canvasElement);
    await userEvent.type(await c.findByPlaceholderText("消费金额（元）"), "60");
    await userEvent.click(c.getByRole("button", { name: "确认核销" }));
    await expect(await c.findByText("✓ 核销成功")).toBeVisible();
  },
};
export const InvalidCode: Story = {
  tags: ["test"],
  ...ManualEntry,
  parameters: {
    ...route("/merchant/redeem"),
    msw: {
      handlers: {
        site: [
          http.post(`${api}/merchant/redeem/prepare`, () =>
            HttpResponse.json({ result: "EXPIRED_CODE" })
          ),
          ...siteHandlers,
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    await enterCode(canvasElement);
    await expect(
      await within(canvasElement).findByText("二维码已过期，请让用户刷新后重试。")
    ).toBeVisible();
  },
};
export const ScanMissingToken: Story = {
  tags: ["test"],
  decorators: [publicShell],
  parameters: {
    ...route("/r/AB23CD"),
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/r/AB23CD", segments: [["code", "AB23CD"]] },
    },
  },
  render: () => <Scan />,
  play: visible("请重新出示二维码"),
};
export const ConfirmGift: Story = {
  tags: ["test"],
  render: () => (
    <RedeemConfirm
      prepare={{
        ...prepare,
        needAmount: false,
        coupon: { ...prepare.coupon, title: "双人甜品赠送券", benefitText: "赠送甜品一份" },
      }}
    />
  ),
  play: visible("双人甜品赠送券"),
};
export const RedeemError: Story = {
  tags: ["test"],
  parameters: {
    msw: { handlers: { site: [failure("/merchant/redeem", "post"), ...siteHandlers] } },
  },
  render: () => <RedeemConfirm prepare={{ ...prepare, needAmount: false }} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "确认核销" }));
    await expect(await c.findByText(/模拟服务暂时不可用/)).toHaveTextContent("模拟服务暂时不可用");
  },
};

export const ScanSuccess: Story = {
  tags: ["test"],
  ...ScanMissingToken,
  beforeEach: () => {
    const url = window.location.href;
    window.history.replaceState(null, "", `${url.split("#")[0]}#t=123456`);
    return () => window.history.replaceState(null, "", url);
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(await c.findByPlaceholderText("消费金额（元）"), "60");
    await userEvent.click(c.getByRole("button", { name: "确认核销" }));
    await expect(await c.findByText(/核销成功/)).toBeVisible();
  },
};
