import Link from "next/link";
import { getLandingPayload } from "../lib/api";
import { HeroRevealCountdown } from "./hero-reveal-countdown";

export const revalidate = 60;

/** Homepage hero strip: public-facing counts differ from admin/API totals. */
const HOMEPAGE_REGISTERED_COUNT_PAD = 50;
const HOMEPAGE_COMPLETED_COUNT_PAD = 40;

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

  return (
    <main>
      <section className="hero-section">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="orb orb-three" />

        <div className="hero-content">
          <p className="eyebrow">Li&apos;an International Education Innovation Zone</p>
          <h1>
            让相遇这件事
            <br />
            值得被认真对待
          </h1>
          <p className="hero-description">
            基于心理学量表的深度问卷，结合匹配算法
            <br />
            每周为你寻找一个在核心价值观、
            生活方式与情感风格上真正契合的人
            <br />
            不做无限滑动，不做社交广场，只做一次值得期待的匹配
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/dashboard">
              开始匹配
            </Link>
            <Link className="button-secondary" href="/about">
              了解机制
            </Link>
          </div>
          <div className="hero-meta">
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

        <div className="hero-card">
          <small>LiLink weekly reveal</small>
          <strong>{landing?.tagline ?? "当前无法连接平台数据接口。"}</strong>
          <p>{landing
              ? "园区限定、学校白名单、每周一个轮次。把相遇从高频刷屏，拉回到节制与期待。"
              : "请稍后重试。如果这是部署环境，请检查前端 API 地址、后端服务和跨域配置。"}</p>
        </div>
      </section>

      <section className="stats-strip">
        <div>
          <span>注册用户</span>
          <strong>
            {landing
              ? `${landing.stats.registeredUsers + HOMEPAGE_REGISTERED_COUNT_PAD}+`
              : "—"}
          </strong>
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
              matchesLabelIsNarrative ? "stats-strip-note" : undefined
            }
          >
            {landing == null
              ? "—"
              : matchesLabelIsNarrative
                ? "正在准备进行首轮匹配"
                : matchesDelivered}
          </strong>
        </div>
      </section>

      <section className="story-section">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>一份经过认真计算的相遇</h2>
        </div>
        <div className="story-grid">
          <article>
            <span>01</span>
            <h3>学校邮箱验证</h3>
            <p>仅接受园区白名单学校邮箱注册。在讨论匹配之前，先确认彼此属于同一个社区。</p>
          </article>
          <article>
            <span>02</span>
            <h3>完成深度问卷</h3>
            <p>{"基于心理学量表的深度问卷，覆盖价值观、人生轨迹、生活颗粒度、情感风格等维度，作为匹配算法的精确输入。"}</p>
          </article>
          <article>
            <span>03</span>
            <h3>每周决定是否参与</h3>
            <p>{"你不用永远在线。只在你愿意的那一周打开参与开关，把主动权留给自己。"}</p>
          </article>
          <article>
            <span>04</span>
            <h3>收到一份匹配与理由</h3>
            <p>不堆列表，不做广场。平台只给你一个对象、一段经过计算的匹配理由，以及心动的可能。</p>
          </article>
        </div>
      </section>

      <section className="statement-section">
        <div className="statement-block">
          <p className="eyebrow">Our philosophy</p>
          <h2>
            在覆盖广度与心灵深度之间
            <br />
            我们选择后者
          </h2>
          <p>提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待。在黎安，同一园区的自然流动不需要噱头。无论同校还是跨校，重要的是让每一个「匹配成功」都真正具备心动的可能。</p>
        </div>
      </section>
    </main>
  );
}
