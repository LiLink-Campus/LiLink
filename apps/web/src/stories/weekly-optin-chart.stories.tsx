import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import WeeklyOptinChart from "@/app/admin/analytics/WeeklyOptinChart";
import type { WeeklyOptinResponse } from "@/app/admin/analytics/types";
import { adminShell, route } from "./site-support";

const meta = {
  id: "admin-weekly-optins",
  title: "管理后台/轮次报名趋势",
  component: WeeklyOptinChart,
  tags: ["smoke"],
  decorators: [adminShell],
  parameters: { fullSite: true, layout: "fullscreen", ...route("/admin/cycles") },
  args: { loading: false },
} satisfies Meta<typeof WeeklyOptinChart>;
export default meta;
type Story = StoryObj<typeof meta>;

const history: WeeklyOptinResponse = {
  includeTest: false,
  cycles: Array.from({ length: 8 }, (_, index) => ({
    cycleId: `synthetic-cycle-${index}`,
    codename: `合成第${index + 1}轮`,
    revealAt: "2026-09-15T13:00:00.000Z",
    status: index === 7 ? "OPEN" : "REVEALED",
    optedIn:
      index === 7
        ? { male: 0, female: 0, nonBinary: 0, unknown: 0, total: 0 }
        : { male: 3, female: 2, nonBinary: 1, unknown: 94, total: 100 },
    femaleShare: index === 7 ? null : 0.4,
  })),
};

export const RepresentativeMixed: Story = {
  args: {
    data: {
      ...history,
      cycles: history.cycles.map((cycle, index) =>
        index === 7
          ? cycle
          : {
              ...cycle,
              optedIn: { male: 60, female: 35, nonBinary: 0, unknown: 5, total: 100 },
              femaleShare: 35 / 95,
            },
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("报名 700 人次")).toBeVisible();
    await expect(canvas.getByText("未知性别 35 人次")).toBeVisible();
    await expect(canvas.getByText("历史性别按留存问卷统计，并非当轮报名时的快照。")).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector(".recharts-bar-rectangle")).toBeVisible());
  },
};

export const HistoryWithUnknown: Story = {
  args: { data: history },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("报名 700 人次")).toBeVisible();
    await expect(canvas.getByText("非二元 7 人次")).toBeVisible();
    await expect(canvas.getByText("未知性别 658 人次")).toBeVisible();
    await expect(canvas.getByText(/女生占比以男女报名人数为基数/)).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector(".recharts-bar-rectangle")).toBeVisible());
    await waitFor(() =>
      expect(canvasElement.querySelector(".recharts-bar-rectangle")!.getBoundingClientRect().height).toBeGreaterThan(0),
    );
    const rect = canvasElement.querySelector(".recharts-bar-rectangle")!.getBoundingClientRect();
    const chart = canvasElement.querySelector(".recharts-wrapper")!;
    fireEvent.mouseMove(chart, { clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 });
    const tooltip = canvasElement.querySelector(".recharts-tooltip-wrapper")!;
    await waitFor(() =>
      expect(within(tooltip as HTMLElement).getByText("合成第1轮（报名 100 人）")).toBeVisible(),
    );
    await expect(within(tooltip as HTMLElement).getByText("40")).toBeVisible();
    fireEvent.mouseLeave(chart);
  },
};

export const AllUnknown: Story = {
  args: {
    data: {
      ...history,
      cycles: [
        {
          ...history.cycles[0],
          optedIn: { male: 0, female: 0, nonBinary: 0, unknown: 100, total: 100 },
          femaleShare: null,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("报名 100 人次")).toBeVisible();
    await expect(canvas.getByText("未知性别 100 人次")).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector(".recharts-bar-rectangle")).toBeVisible());
    await expect(canvasElement.querySelector(".recharts-line-curve")).toBeNull();
  },
};

export const ZeroOptins: Story = {
  args: { data: { ...history, cycles: [history.cycles[7]] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("报名 0 人次")).toBeVisible();
    await expect(canvas.getByText("未知性别 0 人次")).toBeVisible();
    await expect(canvas.queryByText("暂无每周报名趋势数据。")).toBeNull();
  },
};

export const Empty: Story = {
  args: { data: { includeTest: false, cycles: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("暂无每周报名趋势数据。")).toBeVisible();
  },
};

export const Loading: Story = {
  args: { data: null, loading: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("正在加载每周报名…")).toBeVisible();
  },
};
