import Link from "next/link";

const faqs = [
  {
    question: "LiLink 是什么？",
    answer:
      "LiLink 是面向黎安国际教育创新区的匹配平台。基于心理学量表设计的深度问卷，结合匹配算法，每周为你寻找一个在核心价值观、生活方式与情感风格上真正契合的人。",
  },
  {
    question: "匹配算法是怎么运作的？",
    answer:
      "问卷覆盖核心价值观、人生轨迹、生活颗粒度、情感风格等多个维度。算法综合这些维度计算契合度分数，并为每一对匹配生成具体的匹配理由，告诉你系统认为你们会合拍的依据。",
  },
  {
    question: "一定要跨校才能匹配吗？",
    answer:
      "不。同校和跨校的可能性被平等对待。在黎安国际教育创新区，多所高校共享同一园区，跨校并非刻意追求的目标，只是一条自然存在的可能性。算法关注的始终是契合度本身。",
  },
  {
    question: "为什么没有站内聊天？",
    answer:
      "我们希望平台的全部注意力集中在匹配质量上，而不是把你留在应用里刷消息。联系一旦通过引荐邮件建立，后续关系的发展由你们自己决定。",
  },
  {
    question: "本周不想参加怎么办？",
    answer:
      "每个轮次独立运行。你可以在 Dashboard 随时切换参与状态，不需要删号，也不需要解释。下次准备好了再加入就行。",
  },
  {
    question: "我的数据会被怎么处理？",
    answer:
      "邮箱仅用于身份验证和揭晓通知。问卷答案仅用于匹配计算和理由生成。举报记录仅用于安全处理。平台不出售数据、不做广告画像、不向其他用户公开你的任何信息。(我们只在匹配成功后会分享你的邮箱给对方)",
  },
  {
    question: "需要付费吗？",
    answer:
      "完全免费。LiLink 是为园区社区建设的公益项目。",
  },
  {
    question: "可以举报不当行为吗？",
    answer:
      "可以。Dashboard 匹配卡片上有举报入口。举报后，该对象会被立即从你后续所有轮次中隔离，管理团队会尽快处理。",
  },
];

export default function FaqPage() {
  return (
    <main>
      <section className="page-hero page-hero-compact">
        <div className="page-hero-content">
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
          <Link className="button-ghost" href="/about">
            了解更多关于 LiLink
          </Link>
        </div>
      </section>
    </main>
  );
}
