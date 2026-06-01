import { ButtonLink } from "@/components/ui";
import { getLandingPayload } from "../lib/public-server-api";
import {
  CampusLineart,
  CoffeeCupsIllustration,
  GrassRowIllustration,
  ThreeChairsIllustration,
} from "./dashboard/_components/illustrations";
import { HeroRevealCountdown } from "./hero-reveal-countdown";
import { ModeSelectCard } from "./mode-select-card";
import layoutStyles from "./public-layout.module.css";
import styles from "./page.module.css";

export const revalidate = 60;

const HOMEPAGE_REGISTERED_COUNT_PAD = 50;
const HOMEPAGE_COMPLETED_COUNT_PAD = 40;
const HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET = 10;

function formatDateLabel(value: string | null) {
  if (!value) {
    return "轮次时间待配置";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export default async function Home() {
  const landing = await getLandingPayload().catch(() => null);
  const matchesDelivered = landing?.stats.matchesDelivered ?? 0;
  const matchesLabelIsNarrative = landing != null && matchesDelivered <= 0;
  const registeredDisplay = landing
    ? landing.stats.registeredUsers + HOMEPAGE_REGISTERED_COUNT_PAD
    : null;

  return (
    <main className={styles.homePage}>
      <section className={styles.hero}>
        <div className={`${styles.heroContent} animate-in`}>
          <p className="eyebrow">LiLink · 校园里的，认真相遇</p>
          <h1 className="text-balance">
            让相遇这件事
            <br />
            值得<em>被认真对待</em>
          </h1>
          <p className={styles.heroTagline}>
            在校园里，真诚认识，慢慢走近。
            <br />
            基于深度问卷与算法，每周认真为你寻找一个真正合拍的同学。
          </p>
          <div className={styles.heroActions}>
            <ButtonLink href="/dashboard">
              开始匹配 →
            </ButtonLink>
            <ButtonLink variant="secondary" href="/about">
              了解机制
            </ButtonLink>
          </div>
          <div className={styles.heroMeta}>
            <span>{landing ? "下次揭晓" : "状态提醒"}</span>
            <HeroRevealCountdown
              offline={landing == null}
              revealAt={landing?.currentCycle?.revealAt ?? null}
              serverFallbackLabel={
                landing
                  ? formatDateLabel(landing.currentCycle?.revealAt ?? null)
                  : "平台数据暂时不可用"
              }
            />
          </div>
        </div>

        <div className={styles.heroIllustration} aria-hidden="true">
          <CampusLineart />
        </div>
      </section>

      <section className={styles.modeSection}>
        <div className={layoutStyles.sectionHeading}>
          <p className="eyebrow">Choose a mode</p>
          <h2>选择一种相遇方式</h2>
        </div>
        <div className={styles.modeGrid}>
          <ModeSelectCard
            title="1v1 匹配"
            tagline="每周一位新同学，轻松慢相处。"
            status={{ label: "进行中", tone: "active" }}
            illustration={<CoffeeCupsIllustration />}
            footerLine={
              registeredDisplay != null ? (
                <>
                  当前已有 <strong>{registeredDisplay}+</strong> 位同学加入本周
                </>
              ) : (
                "每周一位新同学，轻松慢相处"
              )
            }
            cta={{ href: "/dashboard", label: "开始匹配 →" }}
          />
          <ModeSelectCard
            title="多人局"
            tagline="多人匹配，更多可能。"
            status={{ label: "即将开放", tone: "upcoming" }}
            illustration={<ThreeChairsIllustration />}
            footerLine="多人组队的匹配算法正在打磨"
            disabledCtaLabel="即将开放"
          />
        </div>
      </section>

      <section className={styles.statsStrip}>
        <div>
          <span>注册用户</span>
          <strong>{landing ? `${registeredDisplay}+` : "—"}</strong>
        </div>
        <div>
          <span>已完成问卷</span>
          <strong>
            {landing
              ? landing.stats.completedQuestionnaires +
                HOMEPAGE_COMPLETED_COUNT_PAD
              : "—"}
          </strong>
        </div>
        <div>
          <span>已送出匹配</span>
          <strong
            className={
              matchesLabelIsNarrative ? styles.statsStripNote : undefined
            }
          >
            {landing == null
              ? "—"
              : matchesLabelIsNarrative
                ? "正在准备首轮匹配"
                : matchesDelivered + HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET}
          </strong>
        </div>
      </section>

      <section className={styles.section}>
        <div className={layoutStyles.sectionHeading}>
          <p className="eyebrow">How it works</p>
          <h2>一份经过认真计算的相遇</h2>
        </div>
        <div className={styles.storyGrid}>
          <article>
            <span>01</span>
            <h3>学校邮箱验证</h3>
            <p>
              仅接受合作高校的学校邮箱注册。在讨论匹配之前，先确认彼此都是高校学生。
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>完成深度问卷</h3>
            <p>
              基于心理学量表的深度问卷，覆盖价值观、人生轨迹、生活颗粒度、情感风格等维度，作为匹配算法的精确输入。
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>每周决定是否参与</h3>
            <p>
              你不用永远在线。只在你愿意的那一周打开参与开关，把主动权留给自己。
            </p>
          </article>
          <article>
            <span>04</span>
            <h3>收到一份匹配与理由</h3>
            <p>
              不堆列表，不做广场。平台只给你一个对象、一段经过计算的匹配理由，以及心动的可能。
            </p>
          </article>
        </div>
      </section>

      <section className={styles.statementSection}>
        <div className={styles.statementBlock}>
          <p className="eyebrow">Our philosophy</p>
          <h2 className="text-balance">
            在覆盖广度与心灵深度之间
            <br />
            我们选择后者
          </h2>
          <p>
            提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待。校园本就是同温层，自然流动不需要噱头：无论同校、跨校还是跨园区，重要的是让每一个「匹配成功」都真正具备心动的可能。
          </p>
        </div>
      </section>

      <section className={layoutStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}
