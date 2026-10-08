import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { http, HttpResponse } from "msw";
import type { CenterPageData, ProfilePageData } from "@lilink/shared";
import { useAuthSession } from "@/app/auth-session";
import { CenterBootstrap } from "@/app/dashboard/me/center-bootstrap";
import { ProfileBootstrap } from "@/app/dashboard/profile/profile-bootstrap";
import { profilePageData } from "./dashboard-bootstrap-fixtures";
import { api, dashboardShell, route, siteHandlers } from "./site-support";
import { matchStoryUser as user } from "@/app/dashboard/match/match.fixtures";

// Isolated lifecycle boundary: an RSC bootstrap may replace props without a
// remount. Late success, 401 and failure must never mutate its successor.
const active = { active: true, activatedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
  durationDays: 30, priceYuan: "29.90", advancedFiltersAvailable: true };
const inactive = { ...active, active: false, activatedAt: null, expiresAt: null };
const meta = {
  tags: ["!test"],
  title: "全站/VIP 生命周期", decorators: [dashboardShell],
  parameters: { ...route("/dashboard/me"), msw: { handlers: { site: siteHandlers } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Lifecycle({ profile = false, unknown = false }: { profile?: boolean; unknown?: boolean }) {
  const [bootstrap, setBootstrap] = useState<CenterPageData>({ user, vip: unknown ? null : active });
  const { setUser } = useAuthSession();
  const profileData: ProfilePageData = { ...profilePageData, ...bootstrap };
  // Keep the profile object stable across local auth state changes.
  const [data, setData] = useState(profileData);
  function replace(vip: CenterPageData["vip"]) {
    const next = { user: { ...user }, vip };
    setBootstrap(next);
    setData({ ...profilePageData, ...next });
  }
  return <>
    <div aria-label="合成生命周期控制">
      <button onClick={() => replace(active)}>接受有效 bootstrap</button>
      <button onClick={() => replace(null)}>接受未知 bootstrap</button>
      <button onClick={() => setBootstrap({ user: { ...user, id: "another-synthetic-account", displayName: "另一合成同学" }, vip: inactive })}>切换账号</button>
      <button onClick={() => setUser(null)}>模拟退出</button>
      <button onClick={() => setUser(user)}>同账号重新登录</button>
    </div>
    {profile ? <ProfileBootstrap initialData={data} /> : <CenterBootstrap initialData={bootstrap} />}
  </>;
}

function lateRead(profile: boolean, response: "success" | "401" | "503"): Story {
  let calls = 0;
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  return {
    parameters: { ...route(profile ? "/dashboard/profile" : "/dashboard/me"), msw: { handlers: { site: [
      http.get(`${api}/me/vip`, async () => {
        calls++;
        await delayed;
        return response === "success" ? HttpResponse.json(inactive)
          : HttpResponse.json({ message: "Obsolete lifecycle" }, { status: Number(response) });
      }), ...siteHandlers,
    ] } } },
    render: () => <Lifecycle profile={profile} />,
    play: async ({ canvasElement }) => {
      const c = within(canvasElement);
      try {
        fireEvent(window, new Event("focus"));
        await waitFor(() => expect(calls).toBeGreaterThan(0));
        await userEvent.click(c.getByRole("button", { name: "接受有效 bootstrap" }));
        release();
        await new Promise(resolve => window.setTimeout(resolve, 100));
        if (profile) {
          const directory = c.getByRole("complementary", { name: "桌面题目目录" });
          await userEvent.click(within(directory).getByRole("button", { name: /希望对方的身高/ }));
          const selected = within(canvasElement.querySelector<HTMLElement>('[data-reader-hidden="false"]')!);
          await expect(selected.getByText("高级筛选 · VIP 已启用", { exact: true })).toBeVisible();
        } else await expect(c.getByLabelText("VIP 会员")).toBeVisible();
        await expect(c.queryByText("权益状态暂时无法更新，稍后会自动重试。")).toBeNull();
        await expect(c.queryByText("状态待刷新")).toBeNull();
      } finally { release(); }
    },
  };
}

export const CenterOldSuccess = { ...lateRead(false, "success"), tags: ["test"] } satisfies Story;
export const CenterOldUnauthorized = { ...lateRead(false, "401"), tags: ["test"] } satisfies Story;
export const CenterOldFailure = { ...lateRead(false, "503"), tags: ["test"] } satisfies Story;
export const ProfileOldSuccess = { ...lateRead(true, "success"), tags: ["test"] } satisfies Story;
export const ProfileOldUnauthorized = { ...lateRead(true, "401"), tags: ["test"] } satisfies Story;
export const ProfileOldFailure = { ...lateRead(true, "503"), tags: ["test"] } satisfies Story;

export const NewBootstrapClearsRefreshError: Story = {
  tags: ["test"],
  parameters: { msw: { handlers: { site: [http.get(`${api}/me/vip`, () => HttpResponse.json({ message: "Synthetic outage" }, { status: 503 })), ...siteHandlers] } } },
  render: () => <Lifecycle />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    fireEvent(window, new Event("focus"));
    await expect(await c.findByText("状态待刷新")).toBeVisible();
    await userEvent.click(c.getByRole("button", { name: "接受有效 bootstrap" }));
    await expect(c.getByLabelText("VIP 会员")).toBeVisible();
    await expect(c.queryByText("状态待刷新")).toBeNull();
  },
};

export const UnknownBootstrapReplacesUnknownRead: Story = {
  tags: ["test"],
  ...NewBootstrapClearsRefreshError,
  parameters: unknownHandlers(),
  render: () => <Lifecycle unknown />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => expect(unknownCalls).toBe(1));
    await userEvent.click(c.getByRole("button", { name: "接受未知 bootstrap" }));
    await waitFor(() => expect(unknownCalls).toBe(2));
    await expect(await c.findByLabelText("VIP 会员")).toBeVisible();
  },
};

let unknownCalls = 0;
function unknownHandlers() {
  return { msw: { handlers: { site: [http.get(`${api}/me/vip`, async () => {
    if (++unknownCalls === 1) await new Promise(resolve => window.setTimeout(resolve, 500));
    return HttpResponse.json(active);
  }), ...siteHandlers] } } };
}

export const AccountSwitchIgnoresOldSuccess: Story = {
  tags: ["test"],
  parameters: { msw: { handlers: { site: [http.get(`${api}/me/vip`, async () => {
    await new Promise(resolve => window.setTimeout(resolve, 300));
    return HttpResponse.json(active);
  }), ...siteHandlers] } } },
  render: () => <Lifecycle />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    fireEvent(window, new Event("focus"));
    await userEvent.click(c.getByRole("button", { name: "切换账号" }));
    await new Promise(resolve => window.setTimeout(resolve, 400));
    await expect(c.getByRole("heading", { name: "另一合成同学" })).toBeVisible();
    await expect(c.queryByLabelText("VIP 会员")).toBeNull();
    await expect(c.getByText("未开通", { exact: true })).toBeVisible();
  },
};

export const LogoutAndSameAccountLogin: Story = {
  tags: ["test"],
  parameters: { msw: { handlers: { site: [http.get(`${api}/me/vip`, async () => {
    await new Promise(resolve => window.setTimeout(resolve, 300));
    return HttpResponse.json(active);
  }), ...siteHandlers] } } },
  render: () => <Lifecycle />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    fireEvent(window, new Event("focus"));
    await userEvent.click(c.getByRole("button", { name: "模拟退出" }));
    await new Promise(resolve => window.setTimeout(resolve, 400));
    await expect(c.queryByLabelText("VIP 会员")).toBeNull();
    await userEvent.click(c.getByRole("button", { name: "同账号重新登录" }));
    await expect(await c.findByLabelText("VIP 会员")).toBeVisible();
  },
};
