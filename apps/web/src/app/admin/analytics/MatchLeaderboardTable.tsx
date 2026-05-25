"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./admin-analytics.module.css";
import type {
  LeaderboardRow,
  LeaderboardSortKey,
  MatchLeaderboardResponse,
  SortOrder,
} from "./types";

const adminStyles = [commonStyles, styles];

const SORT_KEYS: readonly LeaderboardSortKey[] = [
  "unmatchedStreak",
  "matchStreak",
  "matchRate",
  "matchedRounds",
  "optInRounds",
];

type GenderTab = "male" | "female";

function isLeaderboardSortKey(value: string): value is LeaderboardSortKey {
  return SORT_KEYS.includes(value as LeaderboardSortKey);
}

function sortLabel(key: LeaderboardSortKey) {
  switch (key) {
    case "unmatchedStreak": return "连续未匹配";
    case "matchStreak": return "连续匹配";
    case "matchRate": return "匹配率";
    case "matchedRounds": return "匹配次数";
    case "optInRounds": return "报名轮次";
  }
}

function formatRate(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function LeaderboardRowItem({
  row,
  rank,
}: {
  row: LeaderboardRow;
  rank: number;
}) {
  const displayName = row.displayName ?? row.email;

  return (
    <tr>
      <td className={cx(adminStyles, "analytics-rank-cell")}>
        <div
          className={cx(
            adminStyles,
            "analytics-rank-badge",
            rank <= 3 && "is-top",
          )}
        >
          {rank}
        </div>
      </td>
      <td>
        <div className={cx(adminStyles, "analytics-leaderboard-user")}>
          <strong title={row.email}>{displayName}</strong>
          <span>{row.schoolName ?? "未分配学校"}</span>
        </div>
      </td>
      <td
        className={cx(
          adminStyles,
          "analytics-metric-cell",
          row.currentUnmatchedStreak >= 3 && "is-risk",
        )}
      >
        {row.currentUnmatchedStreak}
      </td>
      <td className={cx(adminStyles, "analytics-metric-cell")}>
        {row.currentMatchStreak}
      </td>
      <td className={cx(adminStyles, "analytics-metric-cell")}>
        {formatRate(row.matchRate)}
      </td>
      <td className={cx(adminStyles, "analytics-metric-cell")}>
        {row.matchedRounds}
      </td>
      <td className={cx(adminStyles, "analytics-metric-cell")}>
        {row.optInRounds}
      </td>
    </tr>
  );
}

export default function MatchLeaderboardTable({
  data,
  loading,
  includeTest,
}: {
  data: MatchLeaderboardResponse | null;
  loading: boolean;
  includeTest: boolean;
}) {
  const [sort, setSort] = useState<LeaderboardSortKey>("unmatchedStreak");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [genderTab, setGenderTab] = useState<GenderTab>("male");
  const [localData, setLocalData] = useState<MatchLeaderboardResponse | null>(
    data,
  );
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sortAbortRef.current?.abort();
    setLocalData(data);
    if (data) {
      setSort(isLeaderboardSortKey(data.sort) ? data.sort : "unmatchedStreak");
      setOrder(data.order);
    }
  }, [data]);

  useEffect(() => {
    sortAbortRef.current?.abort();
  }, [includeTest]);

  useEffect(() => () => sortAbortRef.current?.abort(), []);

  const handleSort = useCallback(
    async (key: LeaderboardSortKey) => {
      const nextOrder: SortOrder =
        key === sort ? (order === "desc" ? "asc" : "desc") : "desc";
      const params = new URLSearchParams({
        sort: key,
        order: nextOrder,
        limit: String(localData?.limit ?? 50),
      });
      if (includeTest) {
        params.set("includeTest", "true");
      }

      sortAbortRef.current?.abort();
      const controller = new AbortController();
      sortAbortRef.current = controller;

      setSort(key);
      setOrder(nextOrder);
      setLocalLoading(true);
      setError(null);

      try {
        const nextData = await fetchApi<MatchLeaderboardResponse>(
          `/admin/analytics/match-leaderboard?${params.toString()}`,
          { signal: controller.signal },
        );
        if (sortAbortRef.current !== controller) return;
        setLocalData(nextData);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "排行榜加载失败。");
      } finally {
        if (sortAbortRef.current === controller) setLocalLoading(false);
      }
    },
    [includeTest, localData?.limit, order, sort],
  );

  const hasData = Boolean(localData);
  const rows =
    genderTab === "male" ? (localData?.male ?? []) : (localData?.female ?? []);

  return (
    <section className={cx(adminStyles, "analytics-panel")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h2>匹配排行榜</h2>
        <p>按性别查看用户历史匹配表现，点击指标切换排序。</p>
      </div>
      {error ? (
        <p className="ui-form-message ui-form-message--error">{error}</p>
      ) : null}
      {(loading || localLoading) && !hasData ? (
        <div className={cx(adminStyles, "analytics-placeholder")}>
          正在加载排行榜…
        </div>
      ) : localData ? (
        <>
          <div className={cx(adminStyles, "analytics-leaderboard-toolbar")}>
            <div className={cx(adminStyles, "admin-tabs analytics-gender-tabs")}>
              <button
                type="button"
                className={
                  genderTab === "male"
                    ? "ui-segmented-item active"
                    : "ui-segmented-item"
                }
                onClick={() => setGenderTab("male")}
              >
                男生 ({localData.male.length})
              </button>
              <button
                type="button"
                className={
                  genderTab === "female"
                    ? "ui-segmented-item active"
                    : "ui-segmented-item"
                }
                onClick={() => setGenderTab("female")}
              >
                女生 ({localData.female.length})
              </button>
            </div>
          </div>

          <div className={cx(adminStyles, "analytics-summary-row")}>
            <span>
              按{sortLabel(sort)}
              {order === "desc" ? "降序" : "升序"}
            </span>
            <span>显示前 {localData.limit} 名</span>
            {localLoading ? <span>更新中…</span> : null}
          </div>

          {rows.length === 0 ? (
            <div className={cx(adminStyles, "analytics-placeholder")}>
              暂无排行榜数据。
            </div>
          ) : (
            <div className={cx(adminStyles, "admin-table-wrap")}>
              <table
                className={cx(
                  adminStyles,
                  "admin-table",
                  "analytics-table",
                  localLoading && "is-loading",
                )}
                style={localLoading ? { opacity: 0.65, pointerEvents: "none" } : undefined}
              >
                <thead>
                  <tr>
                    <th style={{ width: "3rem" }}>排名</th>
                    <th>用户</th>
                    <th className={cx(adminStyles, "analytics-metric-cell")}>
                      <button
                        type="button"
                        className={cx(
                          adminStyles,
                          "analytics-sort-button",
                          sort === "unmatchedStreak" && "is-active",
                        )}
                        onClick={() => void handleSort("unmatchedStreak")}
                      >
                        连续未匹配
                        {sort === "unmatchedStreak" ? (
                          <span aria-hidden="true">{order === "desc" ? " ↓" : " ↑"}</span>
                        ) : null}
                      </button>
                    </th>
                    <th className={cx(adminStyles, "analytics-metric-cell")}>
                      <button
                        type="button"
                        className={cx(
                          adminStyles,
                          "analytics-sort-button",
                          sort === "matchStreak" && "is-active",
                        )}
                        onClick={() => void handleSort("matchStreak")}
                      >
                        连续匹配
                        {sort === "matchStreak" ? (
                          <span aria-hidden="true">{order === "desc" ? " ↓" : " ↑"}</span>
                        ) : null}
                      </button>
                    </th>
                    <th className={cx(adminStyles, "analytics-metric-cell")}>
                      <button
                        type="button"
                        className={cx(
                          adminStyles,
                          "analytics-sort-button",
                          sort === "matchRate" && "is-active",
                        )}
                        onClick={() => void handleSort("matchRate")}
                      >
                        匹配率
                        {sort === "matchRate" ? (
                          <span aria-hidden="true">{order === "desc" ? " ↓" : " ↑"}</span>
                        ) : null}
                      </button>
                    </th>
                    <th className={cx(adminStyles, "analytics-metric-cell")}>
                      <button
                        type="button"
                        className={cx(
                          adminStyles,
                          "analytics-sort-button",
                          sort === "matchedRounds" && "is-active",
                        )}
                        onClick={() => void handleSort("matchedRounds")}
                      >
                        匹配次数
                        {sort === "matchedRounds" ? (
                          <span aria-hidden="true">{order === "desc" ? " ↓" : " ↑"}</span>
                        ) : null}
                      </button>
                    </th>
                    <th className={cx(adminStyles, "analytics-metric-cell")}>
                      <button
                        type="button"
                        className={cx(
                          adminStyles,
                          "analytics-sort-button",
                          sort === "optInRounds" && "is-active",
                        )}
                        onClick={() => void handleSort("optInRounds")}
                      >
                        报名轮次
                        {sort === "optInRounds" ? (
                          <span aria-hidden="true">{order === "desc" ? " ↓" : " ↑"}</span>
                        ) : null}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <LeaderboardRowItem
                      key={row.userId}
                      row={row}
                      rank={index + 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className={cx(adminStyles, "analytics-placeholder")}>
          暂无排行榜数据。
        </div>
      )}
    </section>
  );
}
