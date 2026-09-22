import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { http, HttpResponse } from "msw";
import OneToOnePage from "./page";
const api = 'http://localhost:4000/v1';
const meta = {
  title: "Marketing/OneToOne", component: OneToOnePage, tags: ["smoke"],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true }, msw: { handlers: { site: null, registration: [
    http.get(`${api}/auth/me`, () => HttpResponse.json({ id: 'synthetic-user', email: 'test@example.test', displayName: '测试同学' })),
    http.post(`${api}/me/match-leads`, async ({request}) => { const data = await request.json() as Record<string, unknown>; return data.realName && data.school && data.major && data.contact && data.consent ? HttpResponse.json({ok:true}) : HttpResponse.json({message:'请填写完整信息'},{status:400}); }),
  ] } } },
} satisfies Meta<typeof OneToOnePage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = {};
export const RegistrationForm: Story = { play: async ({canvasElement}) => { await userEvent.click(await within(canvasElement).findByRole('button',{name:'填写登记表'})); await expect(await within(canvasElement).findByRole('dialog')).toBeVisible(); } };
export const Submitted: Story = { play: async ({canvasElement}) => {
  const c=within(canvasElement); await userEvent.click(await c.findByRole('button',{name:'填写登记表'}));
  for (const [label,value] of [['真实姓名','测试同学'],['学校','测试大学'],['专业','计算机'],['手机号','13800138000']]) await userEvent.type(await c.findByLabelText(label,{exact:true}),value);
  await userEvent.click(c.getByRole('checkbox')); await userEvent.click(c.getByRole('button',{name:'提交登记'})); await expect(await c.findByText('登记成功')).toBeVisible();
} };
export const LoginRequired: Story = { parameters: { msw: { handlers: { registration: [http.get(`${api}/auth/me`,()=>HttpResponse.json({message:'未登录'},{status:401}))] } } }, play: async ({canvasElement})=>{const c=within(canvasElement);await userEvent.click(await c.findByRole('button',{name:'填写登记表'}));await waitFor(() => expect(c.getByRole('link',{name:'去登录'})).toBeVisible());} };
