"use client";

import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./admin-analytics.module.css";

const adminStyles = [commonStyles, styles];

export type KpiTrend = "up" | "down" | "flat";

export type KpiTile = {
  key: string;
  label: string;
  value: string;
  delta?: { text: string; trend: KpiTrend };
  hint?: string;
};

const TREND_GLYPH: Record<KpiTrend, string> = {
  up: "▲",
  down: "▼",
  flat: "■",
};

export default function KpiStrip({ tiles }: { tiles: KpiTile[] }) {
  return (
    <div className={cx(adminStyles, "kpi-strip")}>
      {tiles.map((tile) => (
        <div key={tile.key} className={cx(adminStyles, "kpi-tile")}>
          <span className={cx(adminStyles, "kpi-label")}>{tile.label}</span>
          <span className={cx(adminStyles, "kpi-value")}>{tile.value}</span>
          <span className={cx(adminStyles, "kpi-foot")}>
            {tile.delta ? (
              <span
                className={cx(
                  adminStyles,
                  "kpi-delta",
                  `is-${tile.delta.trend}`,
                )}
              >
                <i aria-hidden="true">{TREND_GLYPH[tile.delta.trend]}</i>
                {tile.delta.text}
              </span>
            ) : null}
            {tile.hint ? (
              <span className={cx(adminStyles, "kpi-hint")}>{tile.hint}</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
