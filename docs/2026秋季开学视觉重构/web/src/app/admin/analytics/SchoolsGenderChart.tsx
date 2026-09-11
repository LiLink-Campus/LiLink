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
        <h2>学校性别分布</h2>
        <p>按学校查看问卷硬性性别答案分布。</p>
      </div>
      {loading && !hasData ? (
        <div className={cx(adminStyles, "analytics-placeholder")}>
          正在加载学校分布…
        </div>
      ) : hasData ? (
        <>
          <div className={cx(adminStyles, "analytics-summary-row")}>
            <span>男 {totals.male}</span>
            <span>女 {totals.female}</span>
            <span>总计 {totals.total}</span>
          </div>
          <div className={cx(adminStyles, "analytics-chart")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 12, bottom: 36, left: 0 }}
              >
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
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  width={44}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="male"
                  name="男"
                  fill="var(--color-brand)"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="female"
                  name="女"
                  fill="var(--color-accent)"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className={cx(adminStyles, "analytics-placeholder")}>
          暂无学校性别分布数据。
        </div>
      )}
    </section>
  );
}
