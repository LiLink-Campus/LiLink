import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import { VipClient, type VipStatus } from "./vip-client";
import { api, dashboardShell, route } from "@/stories/site-support";

const empty: VipStatus = { active: false, activatedAt: null, expiresAt: null, durationDays: 30, priceYuan: '29.90', advancedFiltersAvailable: true };
const active: VipStatus = { ...empty, active: true, activatedAt: '2026-09-17T08:00:00Z', expiresAt: '2026-10-17T08:00:00Z' };
const meta = { title: 'Dashboard/VIP', component: VipClient, decorators: [dashboardShell], parameters: route('/dashboard/vip'), tags: ['smoke'] } satisfies Meta<typeof VipClient>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NotActivated: Story = { args: { initialStatus: empty } };
export const Active: Story = { args: { initialStatus: active }, play: async ({ canvasElement }) => {
  const c = within(canvasElement);
  await expect(c.getByRole('link', { name: '购买 VIP 卡密' })).toBeVisible();
  await expect(c.getByLabelText('VIP 激活码')).toBeVisible();
} };
export const Expired: Story = { args: { initialStatus: { ...active, active: false, expiresAt: '2026-09-01T08:00:00Z' } } };
export const Unavailable: Story = { args: { initialStatus: null } };
export const Activate: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json(active))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    await expect(await c.findByText('激活成功，会员已绑定当前账号。')).toBeVisible();
    await expect(c.getByLabelText('VIP 激活码')).toHaveValue('');
  },
};
export const InvalidCode: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json({ message: '此激活码已被使用，请勿重复兑换。' }, { status: 409 }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    await expect(await c.findByRole('alert')).toHaveTextContent('已被使用');
  },
};
export const Comparison: Story = {
  args: { initialStatus: empty },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const table = within(c.getByRole('table', { name: '普通用户与 VIP 权益对比' }));
    await expect(table.getAllByRole('row')).toHaveLength(10);
    for (const name of ['学校筛选', '身高筛选', '体重筛选', '颜值筛选', '锻炼频率筛选']) {
      const row = within(table.getByRole('row', { name: new RegExp(name) }));
      await expect(row.getByText('不支持', { exact: true })).toBeInTheDocument();
      await expect(row.getByText('支持', { exact: true })).toBeInTheDocument();
    }
    for (const name of ['吸烟情况筛选', '饮酒频率筛选']) {
      const row = within(table.getByRole('row', { name: new RegExp(name) }));
      await expect(row.getAllByText('支持', { exact: true })).toHaveLength(2);
      await expect(row.queryByText('不支持', { exact: true })).toBeNull();
    }
    await expect(c.getByRole('link', { name: '购买 VIP 卡密' })).toHaveAttribute('href', 'https://catfk.com/item/ry2djy');
    await expect(c.getByRole('link', { name: /已有卡密/ })).toHaveAttribute('href', '#vip-activation');
    await expect(c.queryByText('更具体地表达偏好，不保证匹配成功。')).not.toBeInTheDocument();
    await expect(c.getByText(/会员到期后，高级筛选将停止生效/)).toBeVisible();
  },
};

export const ContactSupport: Story = {
  args: { initialStatus: empty },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const trigger = c.getByRole('button', { name: '联系客服' });
    await userEvent.click(trigger);
    const dialog = c.getByRole('dialog', { name: '联系客服' });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByRole('link', { name: 'support@lilink.top' })).toHaveAttribute('href', 'mailto:support@lilink.top');
    await expect(within(dialog).getByText('LiLink5201314')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    await expect(dialog).not.toBeVisible();
    await userEvent.click(trigger);
  },
};
