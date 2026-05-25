"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import { AdminRefreshButton } from "../merchant-admin-ui";
import styles from "./admin-analytics.module.css";
import MatchLeaderboardTable from "./MatchLeaderboardTable";
import SchoolsGenderChart from "./SchoolsGenderChart";
import WeeklyOptinChart from "./WeeklyOptinChart";
import type {
  MatchLeaderboardResponse,
  SchoolsGenderResponse,
  WeeklyOptinResponse,
} from "./types";

const adminStyles = [commonStyles, styles];

export default function AdminAnalyticsDashboard() {
  const [includeTest, setIncludeTest] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [schoolsGender, setSchoolsGender] =
    useState<SchoolsGenderResponse | null>(null);
  const [weeklyOptin, setWeeklyOptin] = useState<WeeklyOptinResponse | null>(
    null,
  );
  const [leaderboard, setLeaderboard] =
    useState<MatchLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      const query = includeTest ? "?includeTest=true" : "";

      try {
        const [schoolsGenderData, weeklyOptinData, leaderboardData] =
          await Promise.all([
            fetchApi<SchoolsGenderResponse>(
              `/admin/analytics/schools-gender${query}`,
              { signal },
            ),
            fetchApi<WeeklyOptinResponse>(
              `/admin/analytics/weekly-optin${query}`,
              { signal },
            ),
            fetchApi<MatchLeaderboardResponse>(
              `/admin/analytics/match-leaderboard${query}`,
              { signal },
            ),
          ]);

        if (signal.aborted) return;
        setSchoolsGender(schoolsGenderData);
        setWeeklyOptin(weeklyOptinData);
        setLeaderboard(leaderboardData);
      } catch (caught) {
        if (signal.aborted) return;
        setError(
          caught instanceof Error ? caught.message : "数据分析加载失败。",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [includeTest],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadNonce]);

  return (
    <div className={cx(adminStyles, "analytics-container")}>
      <div className={cx(adminStyles, "admin-page-header analytics-header")}>
        <div>
          <h1>数据分析</h1>
          <p className={cx(adminStyles, "analytics-header-desc")}>
            查看学校性别分布、每周报名趋势与匹配表现排行榜。
          </p>
        </div>
        <div className={cx(adminStyles, "analytics-toolbar-actions")}>
          <label className={cx(adminStyles, "analytics-toggle")}>
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(event) => setIncludeTest(event.target.checked)}
            />
            <span>含测试账号</span>
          </label>
          <AdminRefreshButton
            onClick={() => setReloadNonce((value) => value + 1)}
            disabled={loading}
          />
        </div>
      </div>

      {error ? (
        <p className="ui-form-message ui-form-message--error">{error}</p>
      ) : null}

      <div className={cx(adminStyles, "analytics-grid")}>
        <SchoolsGenderChart data={schoolsGender} loading={loading} />
        <WeeklyOptinChart data={weeklyOptin} loading={loading} />
        <MatchLeaderboardTable
          data={leaderboard}
          loading={loading}
          includeTest={includeTest}
        />
      </div>
    </div>
  );
}
