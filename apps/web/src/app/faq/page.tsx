import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import {
  GrassRowIllustration,
  TeaTimeIllustration,
} from "../dashboard/_components/illustrations";

type FaqItem = {
  question: string;
  answer: React.ReactNode;
};

const faqs: FaqItem[] = [
  {
    question: "LiLink 是什么？",
    answer:
      "LiLink 是面向高校学生的匹配平台。基于心理学量表设计的深度问卷，结合匹配算法，每周为你寻找一个在核心价值观、生活方式与情感风格上真正契合的同学。",
  },
  {
    question: "我的学校邮箱可以注册吗？",
    answer: (
      <>
        平台仅接受合作高校的学校邮箱注册。完整的可注册学校与邮箱后缀列表见
        {" "}
        <Link href="/schools">支持的学校</Link>
        ，列表实时同步后台配置。如果你的学校尚未上线，欢迎在页脚联系我们补录。
      </>
    ),
  },
  {
    question: "匹配算法是怎么运作的？",
    answer:
      "匹配有几项硬性条件：性别按你的设置严格对应；你填写的身高期望会落实到匹配对象身高上；你期望的颜值水平也会对应到对方的自评颜值——我们无法收集照片，因此颜值由双方诚实自评。在此基础上，问卷还覆盖核心价值观、人生轨迹、生活颗粒度、情感风格等；性格部分会结合 MBTI 与心理学上的行为偏好做加权，重点看双方在关键维度上的适配与互补。",
  },
  {
    question: "可以跨校匹配吗？",
    answer:
      "可以。你可以在「希望 TA」中按学校排除你不希望匹配的学校，未排除的所有合作高校都可能出现在匹配池里。平台不刻意追求跨校，但也不限制——重点始终是契合度本身。",
  },
  {
    question: "为什么没有站内聊天？",
    answer:
      "我们希望平台的全部注意力集中在匹配质量上，而不是把你留在应用里刷消息。联系一旦通过引荐邮件建立，后续关系的发展由你们自己决定。",
  },
  {
    question: "本周不想参加怎么办？",
    answer:
      "每个轮次独立运行。登录后进入首页，使用本周参与开关即可选择是否参加本轮，不需要删号，也不需要解释。下次准备好了再加入就行。",
  },
  {
    question: "我的数据会被怎么处理？",
    answer:
      "邮箱仅用于身份验证和揭晓通知。问卷答案仅用于匹配计算和理由生成。举报记录仅用于安全处理。平台不出售数据、不做广告画像、不向其他用户公开你的任何信息。（仅在你们双方都同意引荐后，邮箱才会通过引荐邮件分享给对方。）",
  },
  {
    question: "需要付费吗？",
    answer:
      "完全免费，是公益的。LiLink 面向校园社区建设；若你愿意，也欢迎赞助以支持可持续维护。",
  },
  {
    question: "可以举报不当行为吗？",
    answer:
      "可以。在本轮匹配结果里，对方信息卡片上会显示举报入口。举报后，该对象会被立即从你后续所有轮次中隔离，管理团队会尽快处理。",
  },
];

export default function FaqPage() {
  return (
    <main>
      <section className="page-hero page-hero-compact is-narrow">
        <div className="page-hero-illustration is-small" aria-hidden="true">
          <TeaTimeIllustration />
        </div>
        <div className="page-hero-content animate-in">
          <p className="eyebrow">FAQ</p>
          <h1>常见问题</h1>
          <p>关于 LiLink 的机制、隐私与运作方式。</p>
        </div>
      </section>

      <section className="faq-section">
        <div className="faq-list">
          {faqs.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <div className="faq-answer">{item.answer}</div>
            </details>
          ))}
        </div>

        <div className="faq-cta">
          <p>没有找到你的问题？</p>
          <ButtonLink variant="ghost" href="/about">
            了解更多关于 LiLink
          </ButtonLink>
        </div>
      </section>

      <section className="home-grass-line" aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}
