import Link from "next/link";
import { getRequestLocale } from "../../lib/locale";
import {
  CampusLineart,
  GrassRowIllustration,
  WheatSprigIllustration,
} from "../dashboard/_components/illustrations";

export const dynamic = "force-dynamic";

const ABOUT_COPY = {
  "zh-CN": {
    title: "与其无数次擦肩，不如一次认真的匹配",
    introOne:
      "LiLink 是面向高校学生的匹配平台。基于心理学量表设计的深度问卷，结合算法，每周为你寻找一个在核心价值观、生活方式与情感风格上真正契合的同学。",
    introTwo:
      "平台不向用户收费，以公益方式运营校园社区；首期合作高校陆续上线，后续会逐步扩展到更多校园与园区。",
    quote:
      "「提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待，让每一个『匹配成功』都真正具备心动的可能。」",
    team: "— LiLink 团队",
    differentHeading: "不是另一个交友 App",
    noSquareTitle: "不做广场",
    noSquareBody:
      "没有公开用户列表，没有站内聊天，没有信息流。平台的全部注意力集中在一件事上：匹配质量。",
    noSwipeTitle: "不做无限滑动",
    noSwipeBody:
      "每周一个轮次，只推送一个匹配结果和一段匹配理由。你可以自由选择是否参与下一轮，把节奏的控制权留给自己。",
    noGimmickTitle: "不做跨校噱头",
    noGimmickBody:
      "同校与跨校被平等对待。你可以在「希望 TA」中按学校、性别、身高、颜值等条件自由筛选；算法关心的，始终是契合度本身。",
    pathHeading: "从注册到匹配的完整路径",
    schoolTitle: "学校邮箱验证",
    schoolBody:
      "仅接受合作高校的学校邮箱。通过邮箱验证码完成注册，确认你是校园里的同学。",
    questionnaireTitle: "填写深度问卷",
    questionnaireBody:
      "基于心理学量表设计的问卷，覆盖核心价值观、人生轨迹、生活颗粒度、情感风格等维度。这些数据构成匹配算法的输入。",
    weeklyTitle: "每周选择参与",
    weeklyBody:
      "每个轮次独立运行，你可以在「我的匹配」里自由开关参与状态。不需要永远在线，也不需要删号才能暂停。",
    resultTitle: "收到匹配与理由",
    resultBody:
      "轮次揭晓时，平台推送一个匹配对象和一段算法生成的匹配理由。确认联系意向后，由平台代发引荐邮件。",
    ctaTitle: "准备好了",
    ctaBody: "填写问卷，加入下一轮匹配。",
    cta: "开始匹配",
    grass: "好的关系，源于尊重与真诚",
  },
  "en-US": {
    title: "Instead of passing by countless times, try one serious match",
    introOne:
      "LiLink is a matching platform for university students. A psychology-informed questionnaire and matching algorithm help find one student each week who may fit your values, lifestyle, and relationship style.",
    introTwo:
      "LiLink is free for users and run as a campus community project. The first supported schools are rolling out now, with more campuses planned later.",
    quote:
      "A higher match rate would only require the algorithm to compromise more. We would rather take each person's expectations seriously.",
    team: "— LiLink Team",
    differentHeading: "Not another dating app",
    noSquareTitle: "No public profile wall",
    noSquareBody:
      "There is no public user list, in-app chat, or feed. The product focuses on one thing: match quality.",
    noSwipeTitle: "No endless swiping",
    noSwipeBody:
      "Each weekly round gives you one match and one set of reasons. You decide whether to join the next round.",
    noGimmickTitle: "No cross-school gimmick",
    noGimmickBody:
      "Same-school and cross-school matches are treated equally. You can set hard preferences for school, gender, height, and appearance; the algorithm focuses on fit.",
    pathHeading: "The path from sign-up to match",
    schoolTitle: "Verify your school email",
    schoolBody:
      "Only supported university email domains can register. Email verification confirms you are part of the campus community.",
    questionnaireTitle: "Complete the questionnaire",
    questionnaireBody:
      "The questionnaire covers values, life patterns, everyday rhythm, and relationship style. These answers become matching inputs.",
    weeklyTitle: "Choose each week",
    weeklyBody:
      "Each round is independent. You can join or pause from your dashboard without deleting your account.",
    resultTitle: "Receive a match and reasons",
    resultBody:
      "When a round is revealed, LiLink shows one match and structured match reasons. If you request contact, LiLink sends introduction emails.",
    ctaTitle: "Ready",
    ctaBody: "Fill out the questionnaire and join the next round.",
    cta: "Start matching",
    grass: "Good relationships start with respect and sincerity",
  },
} as const;

export default async function AboutPage() {
  const locale = await getRequestLocale();
  const copy = ABOUT_COPY[locale];

  return (
    <main>
      <section className="page-hero with-illustration">
        <div className="page-hero-content animate-in">
          <p className="eyebrow">About LiLink</p>
          <h1 className="text-balance">{copy.title}</h1>
          <p>{copy.introOne}</p>
          <p>{copy.introTwo}</p>
        </div>
        <div className="page-hero-illustration" aria-hidden="true">
          <CampusLineart />
        </div>
      </section>

      <section className="about-philosophy">
        <blockquote className="about-quote">
          <p>{copy.quote}</p>
          <cite>{copy.team}</cite>
        </blockquote>
      </section>

      <section className="about-features">
        <div className="section-heading">
          <p className="eyebrow">What makes us different</p>
          <h2>{copy.differentHeading}</h2>
        </div>
        <div className="about-grid">
          <article className="about-card">
            <div className="about-card-icon">01</div>
            <h3>{copy.noSquareTitle}</h3>
            <p>{copy.noSquareBody}</p>
          </article>
          <article className="about-card">
            <div className="about-card-icon">02</div>
            <h3>{copy.noSwipeTitle}</h3>
            <p>{copy.noSwipeBody}</p>
          </article>
          <article className="about-card">
            <div className="about-card-icon">03</div>
            <h3>{copy.noGimmickTitle}</h3>
            <p>{copy.noGimmickBody}</p>
          </article>
        </div>
      </section>

      <section className="about-mechanism">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>{copy.pathHeading}</h2>
        </div>
        <div className="about-steps">
          <div className="about-step">
            <div className="about-step-num">1</div>
            <div>
              <h3>{copy.schoolTitle}</h3>
              <p>{copy.schoolBody}</p>
            </div>
          </div>
          <div className="about-step">
            <div className="about-step-num">2</div>
            <div>
              <h3>{copy.questionnaireTitle}</h3>
              <p>{copy.questionnaireBody}</p>
            </div>
          </div>
          <div className="about-step">
            <div className="about-step-num">3</div>
            <div>
              <h3>{copy.weeklyTitle}</h3>
              <p>{copy.weeklyBody}</p>
            </div>
          </div>
          <div className="about-step">
            <div className="about-step-num">4</div>
            <div>
              <h3>{copy.resultTitle}</h3>
              <p>{copy.resultBody}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-cta">
        <div className="about-cta-illu" aria-hidden="true">
          <WheatSprigIllustration />
        </div>
        <h2>
          {copy.ctaTitle}
          <span className="optical-punct">
            {locale === "zh-CN" ? "？" : "?"}
          </span>
        </h2>
        <p>{copy.ctaBody}</p>
        <Link className="button-primary" href="/dashboard">
          {copy.cta}
        </Link>
      </section>

      <section className="home-grass-line" aria-hidden="true">
        <GrassRowIllustration />
        <span>{copy.grass}</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}
