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
    femaleSharePercent:
      cycle.femaleShare == null ? null : Math.round(cycle.femaleShare * 1000) / 10,
  }));
  const hasData = rows.length > 0;
  const totalOptins = rows.reduce((total, row) => total + row.male + row.female, 0);

  return (
    <section className={cx(adminStyles, "analytics-panel")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h3>最近轮次报名趋势</h3>
        <p>最近 8 个非草稿轮次；女生占比以男女报名人数为基数。</p>
      </div>
      {loading && !hasData ? (
        <div className={cx(adminStyles, "analytics-placeholder")}>正在加载每周报名…</div>
      ) : hasData ? (
        <>
          <div className={cx(adminStyles, "analytics-summary-row")}>
            <span>{rows.length} 个轮次</span>
            <span>男女报名 {totalOptins}</span>
          </div>
          <div className={cx(adminStyles, "analytics-chart")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 28, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={0}
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
                <Tooltip />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="male"
                  name="男报名"
                  fill="var(--admin-chart-male)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="left"
                  dataKey="female"
                  name="女报名"
                  fill="var(--admin-chart-female)"
                  radius={[4, 4, 0, 0]}
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
                  connectNulls
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
