import { ImageReadyPage } from "../_components/ImageReadyPage";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";
import { Registration } from "./Registration";
import faqStyles from "../faq/faq.module.css";

export const metadata: Metadata = {
  title: "1 对 1 恋爱匹配 · LiLink",
  description: "人工登记、个人画像梳理、对应约会套餐与首次约会介绍安排。服务总价每人 ¥599，具体安排请咨询运营。",
};

const steps = [
  ["人工登记", "填写真实姓名、学校、专业和手机号，运营核实身份后与你沟通。"],
  ["刻画画像", "通过人工沟通梳理性格、兴趣与择偶期待，寻找符合需求的候选人。"],
  ["人工筛选和匹配", "根据个人画像与交友需求，由运营人工筛选候选人并进行匹配。"],
  ["双方确认", "找到满意的候选人后，确认双方的意愿，再继续安排约会。"],
  ["安排约会", "结合对应约会套餐，由运营完成首次约会介绍与安排。"],
];

export default function OneToOnePage() {
  return <ImageReadyPage className={styles.page}>
    <div className={styles.topline}><Link href="/dashboard">← 返回</Link></div>
    <section className={styles.hero} aria-labelledby="activity-title">
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>校园里的，认真相遇</span>
        <h1 id="activity-title">先双向心动，<br />再让故事开始。</h1>
        <p>从人工登记、刻画画像，<br />到寻找满意的候选人、安排第一次约会，<br />由运营认真了解你的需求，陪你迈出认识彼此的第一步。</p>

        <span className={styles.heroNote}>在更大的世界里，遇见更合拍的你。</span>
      </div>
      <div className={`${styles.heroCta} ${styles.contactCard}`}>
        <Registration />
      </div>
      <div className={styles.heroArt}><Image data-page-image className={styles.heroImage} src="/images/one-to-one-minimal.webp" alt="两位同学坐在长椅上轻松交流的简约插画" width={1672} height={941} priority sizes="(max-width: 700px) 600px, 1100px" /></div>
    </section>

    <section className={styles.plans} aria-label="服务方案">
      <article className={styles.plan}>
        <span className={styles.kicker}>认真了解你的期待，安排一次真实相遇</span>
        <h2>人工匹配与约会服务</h2><p className={styles.price}><span>¥</span>599<small> / 人</small></p>
        <ul><li>人工登记</li><li>人工刻画画像</li><li>人工筛选和匹配</li><li>对应约会套餐</li><li>首次约会介绍与安排</li></ul>
      </article>
    </section>

    <section id="participate" className={styles.experience} aria-labelledby="flow-title">
      <header><span className={styles.eyebrow}>从了解彼此，到认真相遇</span><h2 id="flow-title">简单的五步，<br />让相遇更自然。</h2></header>
      <div className={styles.experienceItems}>
        {steps.map(([title,copy], index) => <article key={title}><span className={styles.number}>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div>
    </section>
    <section className={`${faqStyles.section} ${styles.faqSection}`} aria-labelledby="activity-faq-title">
      <div className={faqStyles.inner}>
        <h2 id="activity-faq-title" className={faqStyles.title}>常见问题</h2>
        <div className={faqStyles.list}>
      <details name="activity-faq" className={faqStyles.item}><summary>约会套餐具体包含什么？</summary><div className={faqStyles.answer}>约会套餐会根据时间有所调整，具体内容请咨询运营。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>与每周免费匹配有什么区别？</summary><div className={faqStyles.answer}>人工服务包含人工画像梳理和首次约会介绍与安排。每周免费匹配继续照常进行，不要求购买人工服务；请在首页确认每周报名。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>退款政策是什么？</summary><div className={faqStyles.answer}>
        <ul className={styles.refundList}>
          <li><strong>尚未开始建档：退款 100%。</strong><p>付款后尚未正式开始用户调研，可全额退款。</p></li>
          <li><strong>建档完成，尚未推荐候选人：退款 80%。</strong><p>已完成用户调研、画像建立及需求确认并启动筛选，但尚未提供首位有效候选人。扣除 20% 建档、需求分析及初筛启动成本。</p></li>
          <li><strong>进入候选推荐阶段：按有效推荐次数结算。</strong><ul><li>完成 1 次有效候选推荐后主动终止：退款 70%。</li><li>完成 2 次有效候选推荐后主动终止：退款 60%。</li><li>完成 3 次有效候选推荐后仍未达成破冰意向：退款 50%。</li></ul></li>
          <li><strong>同意接触并完成破冰：退款 20%。</strong><p>双方明确同意认识，已完成建群或联系方式交换，并提供首次破冰协助。扣除 80% 意向撮合与破冰交付成本。</p></li>
          <li><strong>双方确认首次见面：原则上不退款。</strong><p>已明确首次线下见面的日期，并就见面安排达成一致，进入最终交付阶段。支持免费协调改期 1 次；若用户主动取消且不再继续，费用不予退还。</p></li>
          <li><strong>完成首次见面：不退款。</strong><p>实际完成第一次线下见面，本次一对一撮合服务全部交付完成，服务正式结束。</p></li>
        </ul>
      </div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>运营引导我添加私人微信并私下付款，怎么办？</summary><div className={faqStyles.answer}>请勿向私人账号付款。若运营从 LiLink 官方运营微信引导你转到私人微信收款，请保留聊天记录和收款账号等证据，发送至 <a href="mailto:support@lilink.top">support@lilink.top</a> 举报。经核实存在此类行为，我们将向举报人奖励 100 元现金。</div></details>
        </div>
      </div>
    </section>
  </ImageReadyPage>;
}
