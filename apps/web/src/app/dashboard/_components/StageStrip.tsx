import type { ReactNode } from "react";
import { RevealCountdown } from "./RevealCountdown";
import styles from "./StageStrip.module.css";

/**
 * Top-of-page context strip that anchors users in time: which round, what
 * phase, and how long until the next reveal / deadline. Reused on Home and
 * Match. Kept light so it doesn't compete with the Focus card below it.
 */
export function StageStrip({
  eyebrow,
  title,
  metaLabel,
  metaValue,
  countdownTo,
  countdownPrefix,
  countdownExpiredLabel,
}: {
  eyebrow: string;
  title: string;
  metaLabel?: string;
  metaValue?: ReactNode;
  countdownTo?: string | null;
  countdownPrefix?: string;
  countdownExpiredLabel?: string;
}) {
  return (
    <div className={styles.strip} role="group" aria-label={eyebrow}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <p className={styles.title}>{title}</p>
      {countdownTo !== undefined ? (
        <span className={styles.meta}>
          {countdownPrefix ?? "距揭晓"}
          <RevealCountdown
            targetIso={countdownTo}
            prefix={countdownPrefix ?? "距揭晓"}
            expiredLabel={countdownExpiredLabel ?? "已开启"}
          />
        </span>
      ) : metaLabel || metaValue ? (
        <span className={styles.meta}>
          {metaLabel}
          {metaValue ? <strong>{metaValue}</strong> : null}
        </span>
      ) : null}
    </div>
  );
}
