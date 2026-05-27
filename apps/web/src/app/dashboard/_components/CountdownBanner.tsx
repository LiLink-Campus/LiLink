import type { AgendaCountdown } from "../_lib/agenda";
import { RevealCountdown } from "./RevealCountdown";
import { ClockIcon } from "./icons";
import styles from "./CountdownBanner.module.css";

/**
 * Always-on "next match countdown" strip on the home page. Visible regardless
 * of whether the user already matched this round, so everyone knows they can
 * still take part next week. Falls back to a "not configured yet" message when
 * there is no open cycle.
 */
export function CountdownBanner({
  countdown,
}: {
  countdown: AgendaCountdown;
}) {
  if (countdown.state === "none") {
    return (
      <section className={`${styles.countdown} ${styles.none}`} aria-label="下次匹配倒计时">
        <span className={styles.icon} aria-hidden="true">
          <ClockIcon />
        </span>
        <div className={styles.main}>
          <p className={styles.kicker}>下一轮</p>
          <p className={styles.title}>尚未配置</p>
          <p className={styles.sub}>
            新一轮开放后这里会显示倒计时，你随时可以参加。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.countdown} aria-label="下次匹配倒计时">
      <span className={styles.icon} aria-hidden="true">
        <ClockIcon />
      </span>
      <div className={styles.main}>
        <p className={styles.kicker}>下次匹配揭晓</p>
        <p className={styles.title}>{countdown.revealLabel}</p>
        <p className={styles.sub}>
          {countdown.codename} · 你可以参加下一周。
        </p>
      </div>
      <RevealCountdown
        targetIso={countdown.revealAt}
        includeSeconds
        prefix="距揭晓"
        expiredLabel="已开启"
        className={styles.timer}
      />
    </section>
  );
}
