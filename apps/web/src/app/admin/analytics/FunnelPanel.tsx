"use client";

import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./admin-analytics.module.css";

const adminStyles = [commonStyles, styles];

type FunnelEventKind = "footprint" | "intent" | "outcome";

type FunnelStep = {
  key: string;
  label: string;
  value: number;
  kind: FunnelEventKind;
};

const KIND_LABEL: Record<FunnelEventKind, string> = {
  footprint: "足迹",
  intent: "意图",
  outcome: "结果",
};

function percent(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export default function FunnelPanel({
  title,
  description,
  steps,
}: {
  title: string;
  description?: string;
  steps: FunnelStep[];
}) {
  const top = steps.length > 0 ? steps[0].value : 0;

  return (
    <section className={cx(adminStyles, "analytics-panel")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <ol className={cx(adminStyles, "funnel-list")}>
        {steps.map((step, index) => {
          const widthPct = top > 0 ? Math.max((step.value / top) * 100, 4) : 0;
          const fromTop = percent(step.value, top);
          const prev = index > 0 ? steps[index - 1].value : step.value;
          const fromPrev = percent(step.value, prev);

          return (
            <li key={step.key} className={cx(adminStyles, "funnel-step")}>
              <div className={cx(adminStyles, "funnel-step-head")}>
                <span className={cx(adminStyles, "funnel-step-label")}>
                  <i
                    className={cx(adminStyles, "funnel-kind", `is-${step.kind}`)}
                    title={KIND_LABEL[step.kind]}
                    aria-hidden="true"
                  />
                  {step.label}
                </span>
                <span className={cx(adminStyles, "funnel-step-value")}>
                  {step.value.toLocaleString()}
                  <em>{fromTop}%</em>
                </span>
              </div>
              <div className={cx(adminStyles, "funnel-track")}>
                <div
                  className={cx(adminStyles, "funnel-bar", `is-${step.kind}`)}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              {index > 0 ? (
                <span className={cx(adminStyles, "funnel-step-drop")}>
                  环比上一步 {fromPrev}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
