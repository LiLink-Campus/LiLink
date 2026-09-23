import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../faq/faq.module.css";

type FaqItem = {
  question: string;
  answer: ReactNode;
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
        平台仅接受合作高校的学校邮箱注册。完整的可注册学校与邮箱后缀列表见{" "}
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
      "可以。你可以在「希望遇见谁」中按学校排除你不希望匹配的学校，未排除的所有合作高校都可能出现在匹配池里。平台不刻意追求跨校，但也不限制——重点始终是契合度本身。",
  },
  {
    question: "为什么没有站内聊天？",
    answer:
      "我们希望平台的全部注意力集中在匹配质量上，而不是把你留在应用里刷消息。联系一旦通过引荐邮件建立，后续关系的发展由你们自己决定。",
  },
  {
    question: "本周不想参加怎么办？",
    answer:
      "每个轮次都需要单独报名。不想参加时不报名即可；已经报名的同学，可以在报名截止前回到首页点击「取消参与」。下轮准备好了，再选择意向报名。",
  },
  {
    question: "我的数据会被怎么处理？",
    answer:
      "邮箱仅用于身份验证和揭晓通知。问卷答案用于匹配计算。举报记录仅用于安全处理。平台不出售数据、不做广告画像，不设公开用户广场。匹配成功并揭晓后，所选联系方式会向匹配对象展示，并通过结果邮件告知双方。",
  },
  {
    question: "需要付费吗？",
    answer: "每周算法匹配永久免费，高级筛选和优先匹配需选购VIP。一对一会人工联系单独交付。",
  },
  {
    question: "可以举报不当行为吗？",
    answer:
      "可以。在本轮匹配结果里，对方信息卡片上会显示举报入口。举报后，该对象会被立即从你后续所有轮次中隔离，管理团队会尽快处理。",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-title">
      <div className={styles.inner}>
        <h2 id="faq-title" className={styles.title}>
          常见问题
        </h2>
        <div className={styles.list}>
          {faqs.map((item) => (
            <details key={item.question} name="home-faq" className={styles.item}>
              <summary>{item.question}</summary>
              <div className={styles.answer}>{item.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
