import { ButtonLink } from "@/components/ui";
import Link from "next/link";
import Image from "next/image";
import { getLandingPayload } from "../lib/public-server-api";
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
import { FaqSection } from "./_components/FaqSection";
import styles from "./page.module.css";
import { VISUAL_PREVIEW } from "../lib/visual-preview/mode";

export const revalidate = 60;

const HOMEPAGE_REGISTERED_COUNT_PAD = 50;
const HOMEPAGE_COMPLETED_COUNT_PAD = 40;
const HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET = 10;

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
    description: "选择本周意向并确认参与。登录后的首页会显示你的参与状态与揭晓时间。",
    Illustration: ProductUpdatesIllustration,
  },
  {
    title: "从一次认识开始",
    description: "查看匹配结果，表达联系意向。双方同意引荐后，再由你们决定怎样继续。",
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
    description: "匹配后先确认联系意向，再通过引荐认识彼此，把下一步留给你们。",
    Icon: HeartIcon,
  },
];

export default async function Home() {
  const landing = await getLandingPayload().catch(() => null);
  const matchesDelivered = landing?.stats.matchesDelivered ?? 0;
  const matchesLabelIsNarrative = !VISUAL_PREVIEW && landing != null && matchesDelivered <= 0;
  const registeredDisplay = landing
    ? landing.stats.registeredUsers + HOMEPAGE_REGISTERED_COUNT_PAD
    : null;

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
            unoptimized
            alt=""
            fill
            priority
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
          <strong>{landing ? `${registeredDisplay}+` : "—"}</strong>
          <span>注册用户</span>
        </div>
        <div>
          <strong>
            {landing ? landing.stats.completedQuestionnaires + HOMEPAGE_COMPLETED_COUNT_PAD : "—"}
          </strong>
          <span>已完成问卷</span>
        </div>
        <div>
          <strong className={matchesLabelIsNarrative ? styles.statsStripNote : undefined}>
            {VISUAL_PREVIEW
              ? 20
              : landing == null
              ? "—"
              : matchesLabelIsNarrative
                ? "正在准备首轮匹配"
                : matchesDelivered + HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET}
          </strong>
          <span>已送出匹配</span>
        </div>
      </section>

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
          <p>
            提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待。校园本就是同温层，自然流动不需要噱头：无论同校、跨校还是跨园区，重要的是让每一个「匹配成功」都真正具备心动的可能。
          </p>
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
