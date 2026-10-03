import type { PublicHomeSnapshot } from "../lib/public-home";
import { HeroRevealCountdown } from "./hero-reveal-countdown";
import { CommunityStats } from "./community-stats";
import styles from "./page.module.css";

function formatDateLabel(value: string | null) {
  if (!value) return "轮次时间待配置";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long", timeStyle: "short", timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function HomeSnapshotSections({ landing, community }: PublicHomeSnapshot) {
  const matches = landing?.stats.matchesDelivered ?? 0;
  return <>
    <section className={styles.revealSection} aria-labelledby="reveal-heading">
      <h2 id="reveal-heading">{landing ? "下次匹配揭晓" : "轮次状态"}</h2>
      <HeroRevealCountdown offline={landing == null} revealAt={landing?.currentCycle?.revealAt ?? null}
        serverFallbackLabel={landing ? formatDateLabel(landing.currentCycle?.revealAt ?? null) : "平台数据暂时不可用"} />
      {landing?.currentCycle?.revealAt ? <p className={styles.revealDate}>
        揭晓时间：<time dateTime={landing.currentCycle.revealAt}>{formatDateLabel(landing.currentCycle.revealAt)}</time>（北京时间）
      </p> : null}
    </section>
    <section className={styles.statsStrip} aria-label="平台数据">
      <div><strong>{landing ? landing.stats.registeredUsers : "—"}</strong><span>注册用户</span></div>
      <div><strong>{landing ? landing.stats.completedQuestionnaires : "—"}</strong><span>累计完成问卷</span></div>
      <div>
        <strong className={landing && matches <= 0 ? styles.statsStripNote : undefined}>
          {landing == null ? "—" : matches <= 0 ? "正在准备首轮匹配" : matches}
        </strong><span>已送出匹配</span>
      </div>
    </section>
    <CommunityStats initialData={community} />
  </>;
}

export function HomeJoinMessage({ landing }: Pick<PublicHomeSnapshot, "landing">) {
  return <p>{landing?.currentCycle?.revealAt
    ? `下一次揭晓：${formatDateLabel(landing.currentCycle.revealAt)}。`
    : "完成匹配资料，准备下一次校园里的认真相遇。"}</p>;
}
