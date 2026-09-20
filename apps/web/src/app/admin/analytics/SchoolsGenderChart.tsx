"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./admin-analytics.module.css";
import type { SchoolsGenderResponse } from "./types";

const adminStyles = [commonStyles, styles];

export default function SchoolsGenderChart({
  data,
  loading,
}: {
  data: SchoolsGenderResponse | null;
  loading: boolean;
}) {
  const rows = data?.schools ?? [];
  const totals = data?.totals ?? {
    male: 0,
    female: 0,
    nonBinary: 0,
    unknown: 0,
    total: 0,
  };
  const hasData = rows.length > 0;

  return (
    <section className={cx(adminStyles, "analytics-panel")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h3>本轮学校与性别</h3>
        <p>本轮报名用户，未提交问卷的性别记为未知。</p>
      </div>
      {loading && !hasData ? (
        <div className={cx(adminStyles, "analytics-placeholder")}>正在加载学校分布…</div>
      ) : hasData ? (
        <>
          <div className={cx(adminStyles, "analytics-summary-row")}>
            <span>男 {totals.male}</span>
            <span>女 {totals.female}</span>
            <span>总计 {totals.total}</span>
          </div>
          <div className={cx(adminStyles, "analytics-chart")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 36, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="schoolName"
                  interval={0}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  angle={-28}
                  textAnchor="end"
                  height={64}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} width={44} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="male"
                  name="男"
                  fill="var(--admin-chart-male)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="female"
                  name="女"
                  fill="var(--admin-chart-female)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                {totals.nonBinary > 0 && (
                  <Bar
                    dataKey="nonBinary"
                    name="非二元"
                    fill="var(--color-warning)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                )}
                {totals.unknown > 0 && (
                  <Bar
                    dataKey="unknown"
                    name="未知"
                    fill="var(--color-text-muted)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className={cx(adminStyles, "analytics-placeholder")}>暂无学校性别分布数据。</div>
      )}
    </section>
  );
}
