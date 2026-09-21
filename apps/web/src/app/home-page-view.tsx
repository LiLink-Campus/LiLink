import { ButtonLink } from "@/components/ui";
import Link from "next/link";
import Image from "next/image";
import type { LandingPayload } from "../lib/landing-payload";
import {
  CampusLineart,
  CoffeeCupsIllustration,
  ProductUpdatesIllustration,
} from "./dashboard/_components/illustrations";
import {
  CalendarIcon,
  HeartIcon,
  ProfileIcon,
  UserCircleIcon,
} from "./dashboard/_components/icons";
import { HeroRevealCountdown } from "./hero-reveal-countdown";
import { CommunityStats } from "./community-stats";
import { FaqSection } from "./_components/FaqSection";
import styles from "./page.module.css";

function formatDateLabel(value: string | null) {
  if (!value) return "轮次时间待配置";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

const steps = [
  {
    title: "先让我们认识你",
    description: "完成邮箱验证与匹配资料，告诉我们你的生活习惯、价值观和相处期待。",
    Illustration: () => <CampusLineart valign="mid" />,
  },
  {
    title: "确认参与，等待揭晓",
    description: "选择本周意向并确认参与，每周二晚上 21:00 揭晓匹配结果。",
    Illustration: ProductUpdatesIllustration,
  },
  {
    title: "从一次认识开始",
    description: "匹配成功后查看对方介绍与联系方式，再由你们决定怎样继续。",
    Illustration: CoffeeCupsIllustration,
  },
];

const features = [
  {
    title: "每周一次",
    description: "按轮次认真寻找一个合拍的同学，给了解留出时间。",
    Icon: CalendarIcon,
  },
  {
    title: "认真了解彼此",
    description: "从价值观、生活习惯和相处期待中，寻找适合彼此的契合点。",
    Icon: ProfileIcon,
  },
  {
    title: "自主决定参与",
    description: "根据自己的状态决定是否参加，参与信息以当前轮次为准。",
    Icon: UserCircleIcon,
  },
  {
    title: "尊重相处的节奏",
    description: "匹配成功后可以直接联系对方，请尊重彼此的意愿，把下一步留给你们。",
    Icon: HeartIcon,
  },
];

export function HomePageView({ landing }: { landing: LandingPayload | null }) {
  const matchesDelivered = landing?.stats.matchesDelivered ?? 0;
  const matchesLabelIsNarrative = landing != null && matchesDelivered <= 0;

  return (
    <main className={styles.homePage}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>LiLink · 校园里的，认真相遇</p>
          <h1>
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
            <ButtonLink href="/dashboard">开始匹配 →</ButtonLink>
            <Link href="/about" className={styles.heroSecondary}>
              了解更多
            </Link>
          </div>
        </div>
        <div className={styles.heroIllustration} aria-hidden="true">
          <Image
            src="/images/campus-blossom-scene-anime.webp"
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
          />
        </div>
      </section>

      <section className={styles.revealSection} aria-labelledby="reveal-heading">
        <h2 id="reveal-heading">{landing ? "下次匹配揭晓" : "轮次状态"}</h2>
        <HeroRevealCountdown
          offline={landing == null}
          revealAt={landing?.currentCycle?.revealAt ?? null}
          serverFallbackLabel={
            landing ? formatDateLabel(landing.currentCycle?.revealAt ?? null) : "平台数据暂时不可用"
          }
        />
        {landing?.currentCycle?.revealAt ? (
          <p className={styles.revealDate}>
            揭晓时间：
            <time dateTime={landing.currentCycle.revealAt}>
              {formatDateLabel(landing.currentCycle.revealAt)}
            </time>
            （北京时间）
          </p>
        ) : null}
      </section>

      <section className={styles.statsStrip} aria-label="平台数据">
        <div>
          <strong>{landing ? landing.stats.registeredUsers : "—"}</strong>
          <span>注册用户</span>
        </div>
        <div>
          <strong>
            {landing ? landing.stats.completedQuestionnaires : "—"}
          </strong>
          <span>累计完成问卷</span>
        </div>
        <div>
          <strong className={matchesLabelIsNarrative ? styles.statsStripNote : undefined}>
            {landing == null
              ? "—"
              : matchesLabelIsNarrative
                ? "正在准备首轮匹配"
                : matchesDelivered}
          </strong>
          <span>已送出匹配</span>
        </div>
      </section>

      <CommunityStats />

      <section className={styles.section} aria-labelledby="steps-heading">
        <div className={styles.sectionHeader}>
          <h2 id="steps-heading">一份相遇，从这里开始</h2>
        </div>
        <div className={styles.stepsGrid}>
          {steps.map(({ title, description, Illustration }, index) => (
            <article key={title} className={styles.stepCard}>
              <div className={styles.stepArt} aria-hidden="true">
                <Illustration />
              </div>
              <div className={styles.stepBody}>
                <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="features-heading">
        <div className={styles.sectionHeader}>
          <h2 id="features-heading">让每一次相遇，都值得期待</h2>
        </div>
        <div className={styles.featuresGrid}>
          {features.map(({ title, description, Icon }) => (
            <article key={title} className={styles.featureCard}>
              <div className={styles.featureIcon} aria-hidden="true">
                <Icon />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className={styles.philosophy}>
          <h3>在覆盖广度与心灵深度之间，我们选择后者。</h3>
        </div>
      </section>

      <FaqSection />

      <section className={styles.finalSection} aria-labelledby="join-heading">
        <div className={styles.finalCard}>
          <div className={styles.finalArt} aria-hidden="true">
            <Image
              src="/images/campus-evening-anime.webp"
              alt=""
              fill
              sizes="(max-width: 1200px) 100vw, 1120px"
            />
          </div>
          <div className={styles.finalContent}>
            <h2 id="join-heading">准备好了吗？</h2>
            <p>
              {landing?.currentCycle?.revealAt
                ? `下一次揭晓：${formatDateLabel(landing.currentCycle.revealAt)}。`
                : "完成匹配资料，准备下一次校园里的认真相遇。"}
            </p>
            <ButtonLink href="/register">立即加入</ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
