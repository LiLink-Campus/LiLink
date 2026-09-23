"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./admin-analytics.module.css";
import type { WeeklyOptinResponse } from "./types";

const adminStyles = [commonStyles, styles];

export default function WeeklyOptinChart({
  data,
  loading,
}: {
  data: WeeklyOptinResponse | null;
  loading: boolean;
}) {
  const rows = (data?.cycles ?? []).map((cycle) => ({
    cycleId: cycle.cycleId,
    label: cycle.codename,
    revealAt: cycle.revealAt,
    male: cycle.optedIn.male,
    female: cycle.optedIn.female,
    nonBinary: cycle.optedIn.nonBinary,
    unknown: cycle.optedIn.unknown,
    total: cycle.optedIn.total,
    femaleSharePercent:
      cycle.femaleShare == null ? null : Math.round(cycle.femaleShare * 1000) / 10,
  }));
  const hasData = rows.length > 0;
  const totals = rows.reduce(
    (total, row) => ({
      optedIn: total.optedIn + row.total,
      nonBinary: total.nonBinary + row.nonBinary,
      unknown: total.unknown + row.unknown,
    }),
    { optedIn: 0, nonBinary: 0, unknown: 0 },
  );

  return (
    <section className={cx(adminStyles, "analytics-panel")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h3>最近轮次报名趋势</h3>
        <p>最近 8 个非草稿轮次；报名按轮次累计人次，包含全部性别；女生占比以男女报名人数为基数。</p>
        <p>历史性别按留存问卷统计，并非当轮报名时的快照。</p>
      </div>
      {loading && !hasData ? (
        <div className={cx(adminStyles, "analytics-placeholder")}>正在加载每周报名…</div>
      ) : hasData ? (
        <>
          <div className={cx(adminStyles, "analytics-summary-row")}>
            <span>{rows.length} 个轮次</span>
            <span>报名 {totals.optedIn} 人次</span>
            <span>非二元 {totals.nonBinary} 人次</span>
            <span>未知性别 {totals.unknown} 人次</span>
          </div>
          <div className={cx(adminStyles, "analytics-chart")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 28, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  minTickGap={12}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  angle={-24}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  labelFormatter={(label, payload) =>
                    `${label}（报名 ${payload[0]?.payload.total ?? 0} 人）`
                  }
                />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="male"
                  name="男报名"
                  fill="var(--admin-chart-male)"
                  stackId="optedIn"
                  unit="人"
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="left"
                  dataKey="female"
                  name="女报名"
                  fill="var(--admin-chart-female)"
                  stackId="optedIn"
                  unit="人"
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="left"
                  dataKey="nonBinary"
                  name="非二元"
                  fill="var(--color-warning)"
                  stackId="optedIn"
                  unit="人"
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="left"
                  dataKey="unknown"
                  name="未知性别"
                  fill="var(--color-text-muted)"
                  stackId="optedIn"
                  unit="人"
                  maxBarSize={32}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="femaleSharePercent"
                  name="女生占比"
                  stroke="var(--admin-chart-ratio)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  unit="%"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className={cx(adminStyles, "analytics-placeholder")}>暂无每周报名趋势数据。</div>
      )}
    </section>
  );
}
