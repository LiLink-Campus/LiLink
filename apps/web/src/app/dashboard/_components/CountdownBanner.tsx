import type { AgendaCountdown } from "../_lib/agenda";
import { ClockIcon } from "./icons";

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
      <section className="v2-countdown is-none" aria-label="下次匹配倒计时">
        <span className="v2-countdown-icon" aria-hidden="true">
          <ClockIcon />
        </span>
        <div className="v2-countdown-main">
          <p className="v2-countdown-title">下一轮尚未配置</p>
          <p className="v2-countdown-sub">
            新一轮开放后这里会显示倒计时，你随时可以参加。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="v2-countdown" aria-label="下次匹配倒计时">
      <span className="v2-countdown-icon" aria-hidden="true">
        <ClockIcon />
      </span>
      <div className="v2-countdown-main">
        <p className="v2-countdown-title">
          下次匹配揭晓 · {countdown.revealLabel}
        </p>
        <p className="v2-countdown-sub">
          {countdown.codename} · 你可以参加下一周。
        </p>
      </div>
      {countdown.relativeLabel ? (
        <span className="v2-countdown-chip">{countdown.relativeLabel}</span>
      ) : null}
    </section>
  );
}
