import { MemberPageView } from "@/app/about/team/[slug]/member-page-view";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, userEvent, within } from "storybook/test";
import { HomePageView } from "@/app/home-page-view";
import { HomeSnapshotSections, HomeJoinMessage } from "@/app/home-snapshot-sections";
import About from "@/app/about/page";
import Schools from "@/app/schools/page";
import Terms from "@/app/terms/page";
import Privacy from "@/app/privacy/page";
import NotFound from "@/app/not-found";
import ErrorPage from "@/app/error";
import { GlobalErrorView } from "@/app/global-error-view";
import globalErrorStyles from "@/app/global-error.module.css";
import { UpdatesPageView } from "@/app/updates/updates-page-view";
import { ReferralLandingView } from "@/app/i/[code]/landing-view";
import { ReferralLandingClient } from "@/app/i/[code]/landing-client";
import { feed, landing } from "./site-fixtures";
import { guest, publicShell, route, visible } from "./site-support";

const meta = {
  id: "site-public",
  title: "全站/公开页面",
  tags: ["smoke", "page"],
  decorators: [publicShell],
  parameters: { fullSite: true, msw: { handlers: { session: [guest] } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function HomeStory({ hasCycle = true }: { hasCycle?: boolean }) {
  const snapshot = { landing: hasCycle ? landing : null, community: null };
  return <HomePageView
    snapshotSections={<HomeSnapshotSections {...snapshot} />}
    joinMessage={<HomeJoinMessage landing={snapshot.landing} />}
  />;
}
export const Home: Story = {
  parameters: route("/"),
  render: () => <HomeStory />,
  play: visible("每周一次"),
};
export const HomeNoCycle: Story = {
  parameters: route("/"),
  render: () => <HomeStory hasCycle={false} />,
  play: visible("每周一次"),
};
export const HomePreviewFallback: Story = {
  tags: ["smoke"],
  parameters: {
    ...route("/"),
    docs: { description: { story: "高清图仍在加载或加载失败时，共用完整构图预览。这里只隐藏高清层；真实网络故障由首页 E2E 验证。" } },
  },
  render: () => <div data-story-home-preview>
    <style>{"[data-story-home-preview] [data-home-preview] > img { visibility: hidden; }"}</style>
    <HomeStory />
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: /让相遇这件事/ })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "开始匹配 →" })).toHaveAttribute("href", "/dashboard");
    await expect(canvas.getByRole("link", { name: "了解更多" })).toHaveAttribute("href", "/about");
    const preview = canvasElement.querySelector("[data-home-preview]")!;
    await expect(preview).toBeVisible();
    await expect(getComputedStyle(preview).backgroundImage).toMatch(/url\(["']?data:image\//);
    await expect(preview.querySelector("img")).not.toBeVisible();
  },
};
export const AboutPage: Story = {
  parameters: route("/about"),
  render: () => <About />,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole("heading", { name: "关于 LiLink" })).toBeVisible(), { timeout: 10_000 });
  },
};
export const SchoolsPage: Story = {
  parameters: route("/schools"),
  render: () => <Schools />,
  play: visible("学校邮箱后缀"),
};
export const TermsPage: Story = {
  parameters: route("/terms"),
  render: () => <Terms />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("heading", { name: "用户协议", level: 1 })).toBeVisible());
    await expect(canvas.queryByRole("navigation", { name: "本页目录" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("navigation", { name: "协议与政策" })).not.toBeInTheDocument();
    await expect(canvas.queryByText("有疑问，和我们说说")).not.toBeInTheDocument();
  },
};
export const PrivacyPage: Story = {
  parameters: route("/privacy"),
  render: () => <Privacy />,
  play: visible("隐私政策"),
};
export const Updates: Story = {
  parameters: route("/updates"),
  render: () => <UpdatesPageView feed={feed} archiveUrl="https://updates.example.test" />,
  play: visible(feed.items[0].title),
};
export const UpdatesPageTwo: Story = {
  parameters: route("/updates"),
  render: () => <UpdatesPageView feed={feed} page={2} archiveUrl="https://updates.example.test" />,
  play: visible(/更早的迭代/),
};
export const UpdatesEmpty: Story = {
  parameters: route("/updates"),
  render: () => (
    <UpdatesPageView
      feed={{ ...feed, items: [], totalPublished: 0 }}
      archiveUrl="https://updates.example.test"
    />
  ),
  play: visible(/最近还没有/),
};
export const MissingPage: Story = { render: () => <NotFound />, play: visible(/页面/) };
const reset = fn();
export const RecoverableError: Story = {
  render: () => <ErrorPage error={new Error("Synthetic error")} reset={reset} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /重试/ }));
    await expect(reset).toHaveBeenCalled();
  },
};
export const GlobalError: Story = {
  parameters: { publicChrome: false },
  render: () => (
    <div className={globalErrorStyles.body}>
      <GlobalErrorView reset={reset} />
    </div>
  ),
  play: visible("出了点问题"),
};
export const InvalidInvite: Story = {
  parameters: route("/i/invalid"),
  render: () => <ReferralLandingClient code="invalid" />,
  play: visible("邀请链接无法识别"),
};
export const Offline: Story = {
  parameters: { publicChrome: false },
  render: () => (
    <iframe
      title="离线页面"
      src="/offline.html"
      style={{ width: "100%", height: "100vh", border: 0 }}
    />
  ),
  play: async ({ canvasElement }) => {
    const iframe = within(canvasElement).getByTitle("离线页面") as HTMLIFrameElement;
    await waitFor(() =>
      expect(iframe.contentDocument?.body.textContent).toContain("当前处于离线状态")
    );
  },
};

export const InviteAccepted: Story = {
  parameters: route("/i/3E4V87GBP2"),
  render: () => <ReferralLandingView valid />,
  play: visible("欢迎加入 LiLink"),
};
export const InviteChecking: Story = {
  parameters: route("/i/3E4V87GBP2"),
  render: () => <ReferralLandingView valid={null} />,
  play: visible("正在验证邀请链接……"),
};

export const FounderDetail: Story = {
  parameters: route("/about/team/yoryon"),
  render: () => <MemberPageView slug="yoryon" />,
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await waitFor(() => expect(c.getByRole("heading", { name: "釉蓝yoryon" })).toBeVisible());
    await expect(c.getByRole("link", { name: "← 返回团队" })).toHaveAttribute("href", "/about#team-title");
  },
};
export const MemberDetail: Story = {
  parameters: route("/about/team/member-02"),
  render: () => <MemberPageView slug="member-02" />,
  play: visible("蟹牛堡"),
};
