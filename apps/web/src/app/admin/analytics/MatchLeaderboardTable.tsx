"use client";

import { useCallback, useEffect, useState } from "react";
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

const SORTABLE_COLUMNS: {
  key: LeaderboardSortKey;
  label: string;
}[] = [
  { key: "matchedRounds", label: "匹配次数" },
  { key: "optInRounds", label: "报名轮次" },
  { key: "matchRate", label: "匹配率" },
  { key: "matchStreak", label: "连续匹配" },
  { key: "unmatchedStreak", label: "连续未匹配" },
];

function isLeaderboardSortKey(value: string): value is LeaderboardSortKey {
  return SORT_KEYS.includes(value as LeaderboardSortKey);
}

function formatRate(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function valueFor(row: LeaderboardRow, key: LeaderboardSortKey) {
  switch (key) {
    case "matchedRounds":
      return row.matchedRounds;
    case "optInRounds":
      return row.optInRounds;
    case "matchRate":
      return formatRate(row.matchRate);
    case "matchStreak":
      return row.currentMatchStreak;
    case "unmatchedStreak":
      return row.currentUnmatchedStreak;
  }
}

function SortableHeader({
  column,
  sort,
  order,
  onSort,
}: {
  column: { key: LeaderboardSortKey; label: string };
  sort: LeaderboardSortKey;
  order: SortOrder;
  onSort: (key: LeaderboardSortKey) => void;
}) {
  const active = sort === column.key;

  return (
    <th scope="col">
      <button
        type="button"
        className={cx(
          adminStyles,
          "analytics-sort-button",
          active && "is-active",
        )}
        onClick={() => onSort(column.key)}
      >
        <span>{column.label}</span>
        {active ? (
          <span aria-hidden="true">{order === "desc" ? "▼" : "▲"}</span>
        ) : null}
      </button>
    </th>
  );
}

function LeaderboardBoard({
  title,
  rows,
  sort,
  order,
  onSort,
}: {
  title: string;
  rows: LeaderboardRow[];
  sort: LeaderboardSortKey;
  order: SortOrder;
  onSort: (key: LeaderboardSortKey) => void;
}) {
  return (
    <div className={cx(adminStyles, "analytics-board")}>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className={cx(adminStyles, "analytics-placeholder")}>
          暂无排行榜数据。
        </div>
      ) : (
        <div className={cx(adminStyles, "admin-table-wrap")}>
          <table
            className={cx(adminStyles, "admin-table analytics-table")}
          >
            <thead>
              <tr>
                <th scope="col">排名</th>
                <th scope="col">用户</th>
                <th scope="col">学校</th>
                {SORTABLE_COLUMNS.map((column) => (
                  <SortableHeader
                    key={column.key}
                    column={column}
                    sort={sort}
                    order={order}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.userId}>
                  <td className={cx(adminStyles, "analytics-rank-cell")}>
                    {index + 1}
                  </td>
                  <td title={row.email}>
                    <strong>{row.displayName ?? row.email}</strong>
                  </td>
                  <td>{row.schoolName ?? "未分配学校"}</td>
                  {SORTABLE_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={cx(
                        adminStyles,
                        "analytics-metric-cell",
                        column.key === "unmatchedStreak" &&
                          row.currentUnmatchedStreak >= 3 &&
                          "is-risk",
                      )}
                    >
                      {valueFor(row, column.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const [localData, setLocalData] = useState<MatchLeaderboardResponse | null>(
    data,
  );
  const [localLoading, setLocalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalData(data);
    if (data) {
      setSort(isLeaderboardSortKey(data.sort) ? data.sort : "unmatchedStreak");
      setOrder(data.order);
    }
  }, [data]);

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

      setSort(key);
      setOrder(nextOrder);
      setLocalLoading(true);
      setError(null);

      try {
        const nextData = await fetchApi<MatchLeaderboardResponse>(
          `/admin/analytics/match-leaderboard?${params.toString()}`,
        );
        setLocalData(nextData);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "排行榜加载失败。");
      } finally {
        setLocalLoading(false);
      }
    },
    [includeTest, localData?.limit, order, sort],
  );

  const hasData = Boolean(localData);

  return (
    <section className={cx(adminStyles, "analytics-panel analytics-panel-wide")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h2>匹配排行榜</h2>
        <p>按性别查看用户历史匹配表现。</p>
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
          <div className={cx(adminStyles, "analytics-summary-row")}>
            <span>排序 {sort}</span>
            <span>{order === "desc" ? "降序" : "升序"}</span>
            <span>每组上限 {localData.limit}</span>
            {localLoading ? <span>更新中…</span> : null}
          </div>
          <div className={cx(adminStyles, "analytics-leaderboards")}>
            <LeaderboardBoard
              title="男生排行榜"
              rows={localData.male}
              sort={sort}
              order={order}
              onSort={handleSort}
            />
            <LeaderboardBoard
              title="女生排行榜"
              rows={localData.female}
              sort={sort}
              order={order}
              onSort={handleSort}
            />
          </div>
        </>
      ) : (
        <div className={cx(adminStyles, "analytics-placeholder")}>
          暂无排行榜数据。
        </div>
      )}
    </section>
  );
}
