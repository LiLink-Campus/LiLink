import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import OneToOnePage from "./page";
const meta = {
  title: "Marketing/OneToOne", component: OneToOnePage, tags: ["smoke"],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof OneToOnePage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { name: "人工匹配与约会服务" })).toBeVisible();
    await expect(c.getByText("添加运营微信咨询")).toBeVisible();
    await expect(c.queryByRole("button", { name: /登记|付款|支付/ })).not.toBeInTheDocument();
    await expect(c.queryByText("7 天恋爱挑战")).not.toBeInTheDocument();
    await expect(c.queryByText("专人牵线")).not.toBeInTheDocument();
  },
};
export const PaymentDetails: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByText("¥299 定金和 ¥300 尾款分别什么时候支付？"));
    await expect(c.getByText(/先支付 ¥299 定金，开始人工登记与画像梳理/)).toBeVisible();
  },
};

export const WechatAndReporting: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getAllByAltText("LiLink 微信二维码")[0]).toBeVisible();
    await userEvent.click(c.getByText("运营引导我添加私人微信并私下付款，怎么办？"));
    await expect(c.getByText(/我们将向举报人奖励 100 元现金/)).toBeVisible();
  },
};
