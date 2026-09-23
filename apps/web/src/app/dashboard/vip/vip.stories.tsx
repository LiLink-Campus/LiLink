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
  await expect(c.getByRole('link', { name: '购买激活码' })).toBeVisible();
  await expect(c.getByLabelText('VIP 激活码')).not.toBeVisible();
  await expect(c.getByText('已生效', { exact: true })).toBeVisible();
} };
export const Expired: Story = { args: { initialStatus: { ...active, active: false, expiresAt: '2026-09-01T08:00:00Z' } } };
export const Unavailable: Story = { args: { initialStatus: null }, play: async ({ canvasElement }) => {
  const c = within(canvasElement);
  await expect(c.getByRole('button', { name: '使用激活码' })).toBeDisabled();
  await expect(c.queryByText('已生效', { exact: true })).toBeNull();
} };
export const ActivationDialog: Story = { args: { initialStatus: active }, play: async ({ canvasElement }) => {
  const c = within(canvasElement);
  const trigger = c.getByRole('button', { name: '使用激活码' });
  await userEvent.click(trigger);
  const dialog = c.getByRole('dialog', { name: '使用激活码' });
  await expect(c.getByLabelText('VIP 激活码')).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
  await userEvent.click(c.getByRole('button', { name: '关闭激活弹窗' }));
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
} };
export const Activate: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json({ ...active, activationOutcome: 'ACTIVATED' }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    const dialog = await c.findByRole('dialog', { name: 'VIP 开通成功' });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByText('2026/10/17 16:00')).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: '知道了' })).toHaveFocus();
    await expect(c.getByLabelText('VIP 激活码')).toHaveValue('');
  },
};
export const InvalidCode: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json({ message: '此激活码已被使用，请勿重复兑换。' }, { status: 409 }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    await expect(await c.findByRole('dialog', { name: '激活未完成' })).toHaveTextContent('已被使用');
    await expect(c.getByLabelText('VIP 激活码')).toHaveValue('ABCDEFGHIJKLMNOPQRSTUVWX');
  },
};

function resultStory(outcome: string, title: string, initialStatus: VipStatus = active, result: VipStatus = active): Story {
  return {
    args: { initialStatus },
    parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json({ ...result, activationOutcome: outcome, previousExpiresAt: initialStatus.expiresAt }))] } } },
    play: async ({ canvasElement }) => {
      const c = within(canvasElement);
      await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
      await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
      await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
      const dialog = await c.findByRole('dialog', { name: title });
      await expect(dialog).toBeVisible();
      await expect(within(dialog).getByText('北京时间')).toBeVisible();
      await expect(within(dialog).getByRole('button', { name: '知道了' })).toHaveFocus();
    },
  };
}
export const Extend = resultStory('EXTENDED', 'VIP 续费成功', active, { ...active, expiresAt: '2026-11-16T08:00:00Z' });
export const Reactivate = resultStory('REACTIVATED', 'VIP 开通成功', { ...active, active: false, expiresAt: '2026-09-01T08:00:00Z' });
export const AlreadyRedeemed = resultStory('ALREADY_REDEEMED', '此激活码已兑换');
export const AlreadyRedeemedExpired = resultStory('ALREADY_REDEEMED', '此激活码已兑换', empty, { ...active, active: false, expiresAt: '2026-09-01T08:00:00Z' });
export const InvalidFormat: Story = {
  args: { initialStatus: empty },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
    const submit = c.getByRole('button', { name: '确认激活 30 天 VIP' });
    await userEvent.click(submit);
    const dialog = await c.findByRole('dialog', { name: '请检查激活码' });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '知道了' }));
    await expect(dialog).not.toBeVisible();
    await expect(submit).toHaveFocus();
    await userEvent.click(submit);
    await expect(dialog).toBeVisible();
  },
};
export const NetworkError: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.error())] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    await expect(await c.findByRole('dialog', { name: '暂未确认激活结果' })).toBeVisible();
    await expect(c.getByLabelText('VIP 激活码')).toHaveValue('ABCDEFGHIJKLMNOPQRSTUVWX');
  },
};
export const UnavailableCode: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json({ message: '激活码无效或已停用，请核对订单或联系客服。' }, { status: 400 }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    await expect(await c.findByRole('dialog', { name: '激活未完成' })).toHaveTextContent('激活码无效或已停用');
  },
};
export const RateLimited: Story = {
  args: { initialStatus: empty },
  parameters: { msw: { handlers: { vip: [http.post(`${api}/me/vip/activate`, () => HttpResponse.json({ message: 'ThrottlerException: Too Many Requests' }, { status: 429 }))] } } },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '使用激活码' }));
    await userEvent.type(c.getByLabelText('VIP 激活码'), 'ABCDEFGHIJKLMNOPQRSTUVWX');
    await userEvent.click(c.getByRole('button', { name: '确认激活 30 天 VIP' }));
    await expect(await c.findByRole('dialog', { name: '激活未完成' })).toHaveTextContent('操作太频繁');
  },
};
export const Comparison: Story = {
  args: { initialStatus: empty },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByText('VIP 与普通用户有什么区别？', { exact: true }));
    const table = within(c.getByRole('table', { name: '普通用户与 VIP 权益对比' }));
    await expect(table.getAllByRole('row')).toHaveLength(11);
    for (const name of ['优先匹配', '学校筛选', '身高筛选', '体重筛选', '颜值筛选', '锻炼频率筛选']) {
      const row = within(table.getByRole('row', { name: new RegExp(name) }));
      await expect(row.getByText('不支持', { exact: true })).toBeInTheDocument();
      await expect(row.getByText('支持', { exact: true })).toBeInTheDocument();
    }
    for (const name of ['吸烟情况筛选', '饮酒频率筛选']) {
      const row = within(table.getByRole('row', { name: new RegExp(name) }));
      await expect(row.getAllByText('支持', { exact: true })).toHaveLength(2);
      await expect(row.queryByText('不支持', { exact: true })).toBeNull();
    }
    await expect(c.getByRole('link', { name: '购买激活码' })).toHaveAttribute('href', 'https://catfk.com/item/ry2djy');
    await userEvent.click(c.getByText('会员到期后会怎样？', { exact: true }));
    await expect(c.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
    await expect(c.queryByText('更具体地表达偏好，不保证匹配成功。')).not.toBeInTheDocument();
    await expect(c.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();
    await userEvent.click(c.getByText('会员到期后会怎样？', { exact: true }));
    await expect(c.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).not.toBeVisible();
    await expect(c.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
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
    await expect(within(dialog).getByRole('button', { name: '关闭' })).toHaveFocus();
    await expect(within(dialog).getByRole('link', { name: 'support@lilink.top' })).toHaveAttribute('href', 'mailto:support@lilink.top');
    await expect(within(dialog).getByText('LiLink5201314')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await expect(within(dialog).getByRole('button', { name: '关闭' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(dialog).not.toBeVisible();
    await userEvent.click(trigger);
  },
};
