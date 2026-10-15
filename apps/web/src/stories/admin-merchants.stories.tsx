import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import Merchants from "@/app/admin/merchants/page";
import { adminShell, route, failure } from "./site-support";
import { adminHandlers } from "./admin-handlers";

const meta = {
  title: "全站/运营后台/合作商家",
  decorators: [adminShell],
  parameters: {
    fullSite: true,
    ...route("/admin/merchants"),
    msw: { handlers: { admin: adminHandlers } },
  },
  render: () => <Merchants />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AccountLoadError: Story = {
  tags: ["test"],
  parameters: {
    msw: { handlers: { admin: [failure("/admin/merchants/:id/users"), ...adminHandlers] } },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(await c.findByRole("button", { name: /^青禾咖啡$/ }));
    await expect(await c.findByRole("button", { name: "重试加载账号" })).toBeVisible();
    await expect(c.queryByText("暂无核销账号。")).not.toBeInTheDocument();
  },
};
