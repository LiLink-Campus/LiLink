import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { useState } from "react";
import { QrCode } from "@/components/qr-code";
import * as Icons from "@/app/dashboard/_components/icons";
import * as Illustrations from "@/app/dashboard/_components/illustrations";
import { BrandMark } from "@/app/brand-mark";
import { BirthDatePicker } from "@/app/dashboard/_components/BirthDatePicker";
import { ValuePicker } from "@/app/dashboard/_components/ValuePicker";
import { AppShell } from "@/app/dashboard/_components/AppShell";
import { UserCenter } from "@/app/dashboard/me/user-center";
import { useDashboardSessionSeed } from "@/app/dashboard/_components/DashboardSessionSeed";
import { matchStoryUser } from "@/app/dashboard/match/match.fixtures";
import { now } from "./site-fixtures";
import { visible, route } from "./site-support";
import SchoolsGenderChart from "@/app/admin/analytics/SchoolsGenderChart";
import WeeklyOptinChart from "@/app/admin/analytics/WeeklyOptinChart";
import { schoolGender, weekly } from "./admin-fixtures";
const meta = {
  id: "site-components",
  title: "全站/共享组件",
  tags: ["smoke"],
  parameters: { fullSite: true, fixedNow: now, layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Brand: Story = { render: () => <BrandMark href="/" />, play: visible("LiLink") };
export const IconGallery: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        gap: 24,
      }}
    >
      {Object.entries(Icons).map(([name, Icon]) => (
        <figure key={name}>
          <div style={{ width: 28, height: 28 }}>
            <Icon />
          </div>
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
  play: visible("HomeIcon"),
};
export const IllustrationGallery: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
        gap: 24,
      }}
    >
      {Object.entries(Illustrations).map(([name, Illustration]) => (
        <figure key={name}>
          <div style={{ height: 160 }}>
            <Illustration />
          </div>
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
  play: visible("CoffeeCupsIllustration"),
};
export const Qr: Story = {
  render: () => <QrCode value="https://example.test/i/STORYCODE" />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("canvas")).toBeVisible();
  },
};
function DateControl() {
  const [value, setValue] = useState("2005-02-18");
  return <BirthDatePicker value={value} minYear={1930} maxYear={2012} onChange={setValue} />;
}
export const BirthDate: Story = {
  render: () => <DateControl />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "选择出生日期" }));
    await userEvent.selectOptions(c.getByLabelText("出生月份"), "3");
    await userEvent.click(c.getByRole("button", { name: "2005年3月20日" }));
    await expect(c.getByRole("button", { name: "选择出生日期" })).toHaveTextContent("2005/03/20");
  },
};
export const NativeValuePicker: Story = {
  render: () => (
    <ValuePicker
      value="170"
      options={[
        { value: "160", label: "160" },
        { value: "170", label: "170" },
      ]}
      suffix="cm"
      ariaLabel="身高"
      onChange={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("combobox", { name: "身高" })).toHaveValue("170");
  },
};
function Shell() {
  useDashboardSessionSeed(matchStoryUser);
  return (
    <AppShell>
      <div style={{ padding: 24 }}>账号操作与底部导航</div>
    </AppShell>
  );
}
export const AccountMenu: Story = {
  parameters: route("/dashboard"),
  render: () => <Shell />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: /账号菜单/ }));
    await expect(c.getByRole("menu")).toBeVisible();
  },
};
export const DeactivateDialog: Story = {
  parameters: route("/dashboard/me"),
  render: () => <UserCenter initialUser={matchStoryUser} initialStatus={null} />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "注销账号" }));
    await expect(c.getByRole("dialog", { name: "注销账号" })).toBeVisible();
    await expect(c.getByRole("button", { name: "确认注销账号" })).toBeDisabled();
  },
};
export const SchoolGenderChart: Story = {
  render: () => <SchoolsGenderChart data={schoolGender} loading={false} />,
  play: visible("本轮学校与性别"),
};
export const WeeklyChart: Story = {
  render: () => <WeeklyOptinChart data={weekly} loading={false} />,
  play: visible(/每周|每轮|报名/),
};
