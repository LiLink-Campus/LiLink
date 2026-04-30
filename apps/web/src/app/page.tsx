import Link from "next/link";
import { getLandingPayload } from "../lib/public-server-api";
import {
  CampusLineart,
  CoffeeCupsIllustration,
  GrassRowIllustration,
  ThreeChairsIllustration,
} from "./dashboard/_components/illustrations";
import { HeroRevealCountdown } from "./hero-reveal-countdown";
import { LocalizedText } from "./localized-text";
import { ModeSelectCard } from "./mode-select-card";

export const revalidate = 60;

const HOMEPAGE_REGISTERED_COUNT_PAD = 50;
const HOMEPAGE_COMPLETED_COUNT_PAD = 40;
const HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET = 10;

const HOME_COPY = {
  "zh-CN": {
    dateMissing: "轮次时间待配置",
    eyebrow: "LiLink · 校园里的，认真相遇",
    titleStart: "让相遇这件事",
    titleEmphasis: "值得被认真对待",
    taglineOne: "在校园里，真诚认识，慢慢走近。",
    taglineTwo: "基于深度问卷与算法，每周认真为你寻找一个真正合拍的同学。",
    start: "开始匹配 →",
    mechanism: "了解机制",
    nextReveal: "下次揭晓",
    status: "状态提醒",
    offline: "平台数据暂时不可用",
    modeHeading: "选择一种相遇方式",
    oneOnOneTitle: "1v1 匹配",
    oneOnOneTagline: "每周一位新同学，轻松慢相处。",
    active: "进行中",
    joinedPrefix: "当前已有",
    joinedSuffix: "位同学加入本周",
    oneOnOneFooter: "每周一位新同学，轻松慢相处",
    groupTitle: "多人局",
    groupTagline: "多人匹配，更多可能。",
    upcoming: "即将开放",
    groupFooter: "多人组队的匹配算法正在打磨",
    registeredUsers: "注册用户",
    completedQuestionnaires: "已完成问卷",
    deliveredMatches: "已送出匹配",
    preparingFirstRound: "正在准备首轮匹配",
    howItWorksHeading: "一份经过认真计算的相遇",
    schoolTitle: "学校邮箱验证",
    schoolBody:
      "仅接受合作高校的学校邮箱注册。在讨论匹配之前，先确认彼此都是高校学生。",
    questionnaireTitle: "完成深度问卷",
    questionnaireBody:
      "基于心理学量表的深度问卷，覆盖价值观、人生轨迹、生活颗粒度、情感风格等维度，作为匹配算法的精确输入。",
    weeklyTitle: "每周决定是否参与",
    weeklyBody:
      "你不用永远在线。只在你愿意的那一周打开参与开关，把主动权留给自己。",
    resultTitle: "收到一份匹配与理由",
    resultBody:
      "不堆列表，不做广场。平台只给你一个对象、一段经过计算的匹配理由，以及心动的可能。",
    philosophyLineOne: "在覆盖广度与心灵深度之间",
    philosophyLineTwo: "我们选择后者",
    philosophyBody:
      "提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待。校园本就是同温层，自然流动不需要噱头：无论同校、跨校还是跨园区，重要的是让每一个「匹配成功」都真正具备心动的可能。",
    grass: "好的关系，源于尊重与真诚",
  },
  "en-US": {
    dateMissing: "Round time is not configured",
    eyebrow: "LiLink · Intentional campus matching",
    titleStart: "Make meeting someone",
    titleEmphasis: "worth taking seriously",
    taglineOne: "Meet sincerely and move closer at your own pace.",
    taglineTwo:
      "Every week, LiLink uses a deep questionnaire and matching algorithm to find one student who may truly fit.",
    start: "Start matching →",
    mechanism: "How it works",
    nextReveal: "Next reveal",
    status: "Status",
    offline: "Platform data is temporarily unavailable",
    modeHeading: "Choose a matching mode",
    oneOnOneTitle: "1v1 Match",
    oneOnOneTagline: "One new student each week, with room to go slowly.",
    active: "Open",
    joinedPrefix: "",
    joinedSuffix: "students have joined this week",
    oneOnOneFooter: "One new student each week, with room to go slowly",
    groupTitle: "Group Match",
    groupTagline: "More people, more possibilities.",
    upcoming: "Coming soon",
    groupFooter: "The group matching algorithm is being refined",
    registeredUsers: "Registered users",
    completedQuestionnaires: "Completed questionnaires",
    deliveredMatches: "Matches delivered",
    preparingFirstRound: "Preparing the first reveal",
    howItWorksHeading: "A meeting calculated with care",
    schoolTitle: "School email verification",
    schoolBody:
      "Registration is limited to supported university email domains, so both sides know they are meeting students.",
    questionnaireTitle: "Complete the deep questionnaire",
    questionnaireBody:
      "The questionnaire covers values, life patterns, everyday rhythm, and relationship style as precise input for matching.",
    weeklyTitle: "Decide each week",
    weeklyBody:
      "You do not need to stay available forever. Join only for the week you want to participate.",
    resultTitle: "Receive one match and reasons",
    resultBody:
      "No public profile wall or endless list. LiLink gives you one person, structured match reasons, and a real chance to consider.",
    philosophyLineOne: "Between broad coverage and deeper fit",
    philosophyLineTwo: "we choose the latter",
    philosophyBody:
      "Higher match volume would be easy if the algorithm compromised more. LiLink is built to respect each person's expectations, whether the match is within one school, across schools, or across campuses.",
    grass: "Good relationships start with respect and sincerity",
  },
} as const;

function formatDateLabel(value: string | null, locale: keyof typeof HOME_COPY) {
  if (!value) {
    return HOME_COPY[locale].dateMissing;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function homeText(key: keyof (typeof HOME_COPY)["zh-CN"]) {
  return (
    <LocalizedText zh={HOME_COPY["zh-CN"][key]} en={HOME_COPY["en-US"][key]} />
  );
}

export default async function Home() {
  const landing = await getLandingPayload().catch(() => null);
  const matchesDelivered = landing?.stats.matchesDelivered ?? 0;
  const matchesLabelIsNarrative = landing != null && matchesDelivered <= 0;
  const registeredDisplay = landing
    ? landing.stats.registeredUsers + HOMEPAGE_REGISTERED_COUNT_PAD
    : null;
  const revealAt = landing?.currentCycle?.revealAt ?? null;
  const zhRevealFallback = landing
    ? formatDateLabel(revealAt, "zh-CN")
    : HOME_COPY["zh-CN"].offline;
  const enRevealFallback = landing
    ? formatDateLabel(revealAt, "en-US")
    : HOME_COPY["en-US"].offline;

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-content animate-in">
          <p className="eyebrow">{homeText("eyebrow")}</p>
          <h1 className="text-balance">
            {homeText("titleStart")}
            <br />
            <em>{homeText("titleEmphasis")}</em>
          </h1>
          <p className="home-hero-tagline">
            {homeText("taglineOne")}
            <br />
            {homeText("taglineTwo")}
          </p>
          <div className="home-hero-actions">
            <Link className="button-primary" href="/dashboard">
              {homeText("start")}
            </Link>
            <Link className="button-secondary" href="/about">
              {homeText("mechanism")}
            </Link>
          </div>
          <div className="home-hero-meta">
            <span>{landing ? homeText("nextReveal") : homeText("status")}</span>
            <HeroRevealCountdown
              offline={landing == null}
              revealAt={revealAt}
              serverFallbackLabel={
                <LocalizedText zh={zhRevealFallback} en={enRevealFallback} />
              }
            />
          </div>
        </div>

        <div className="home-hero-illustration" aria-hidden="true">
          <CampusLineart />
        </div>
      </section>

      <section className="home-mode-section">
        <div className="section-heading">
          <p className="eyebrow">Choose a mode</p>
          <h2>{homeText("modeHeading")}</h2>
        </div>
        <div className="home-mode-grid">
          <ModeSelectCard
            title={homeText("oneOnOneTitle")}
            tagline={homeText("oneOnOneTagline")}
            status={{ label: homeText("active"), tone: "active" }}
            illustration={<CoffeeCupsIllustration className="mode-illu-svg" />}
            footerLine={
              registeredDisplay != null ? (
                <>
                  <span className="locale-text locale-text-zh">
                    {HOME_COPY["zh-CN"].joinedPrefix}{" "}
                    <strong>{registeredDisplay}+</strong>{" "}
                    {HOME_COPY["zh-CN"].joinedSuffix}
                  </span>
                  <span className="locale-text locale-text-en">
                    <strong>{registeredDisplay}+</strong>{" "}
                    {HOME_COPY["en-US"].joinedSuffix}
                  </span>
                </>
              ) : (
                homeText("oneOnOneFooter")
              )
            }
            cta={{ href: "/dashboard", label: homeText("start") }}
          />
          <ModeSelectCard
            title={homeText("groupTitle")}
            tagline={homeText("groupTagline")}
            status={{ label: homeText("upcoming"), tone: "upcoming" }}
            illustration={<ThreeChairsIllustration className="mode-illu-svg" />}
            footerLine={homeText("groupFooter")}
            disabledCtaLabel={homeText("upcoming")}
          />
        </div>
      </section>

      <section className="stats-strip">
        <div>
          <span>{homeText("registeredUsers")}</span>
          <strong>{landing ? `${registeredDisplay}+` : "—"}</strong>
        </div>
        <div>
          <span>{homeText("completedQuestionnaires")}</span>
          <strong>
            {landing
              ? landing.stats.completedQuestionnaires +
                HOMEPAGE_COMPLETED_COUNT_PAD
              : "—"}
          </strong>
        </div>
        <div>
          <span>{homeText("deliveredMatches")}</span>
          <strong
            className={
              matchesLabelIsNarrative ? "stats-strip-note" : undefined
            }
          >
            {landing == null
              ? "—"
              : matchesLabelIsNarrative
                ? homeText("preparingFirstRound")
                : matchesDelivered + HOMEPAGE_MATCHES_DELIVERED_DISPLAY_OFFSET}
          </strong>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>{homeText("howItWorksHeading")}</h2>
        </div>
        <div className="story-grid">
          <article>
            <span>01</span>
            <h3>{homeText("schoolTitle")}</h3>
            <p>{homeText("schoolBody")}</p>
          </article>
          <article>
            <span>02</span>
            <h3>{homeText("questionnaireTitle")}</h3>
            <p>{homeText("questionnaireBody")}</p>
          </article>
          <article>
            <span>03</span>
            <h3>{homeText("weeklyTitle")}</h3>
            <p>{homeText("weeklyBody")}</p>
          </article>
          <article>
            <span>04</span>
            <h3>{homeText("resultTitle")}</h3>
            <p>{homeText("resultBody")}</p>
          </article>
        </div>
      </section>

      <section className="statement-section">
        <div className="statement-block">
          <p className="eyebrow">Our philosophy</p>
          <h2 className="text-balance">
            {homeText("philosophyLineOne")}
            <br />
            {homeText("philosophyLineTwo")}
          </h2>
          <p>{homeText("philosophyBody")}</p>
        </div>
      </section>

      <section className="home-grass-line" aria-hidden="true">
        <GrassRowIllustration />
        <span>{homeText("grass")}</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}
