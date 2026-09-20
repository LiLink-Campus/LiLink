import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";
import { SocialQr, socialChannels } from "../_components/SocialQr";
import { WechatContact } from "./wechat-contact";
import faqStyles from "../faq/faq.module.css";

export const metadata: Metadata = {
  title: "1 对 1 恋爱匹配 · LiLink",
  description: "人工登记、个人画像梳理、对应约会套餐与首次约会介绍安排。服务总价每人 ¥599，定金 ¥199、尾款 ¥400，目前暂未开放。",
};

const steps = [
  ["人工登记", "开放后支付 ¥199 定金，由运营登记你的基本情况与交友需求。"],
  ["刻画画像", "通过人工沟通梳理性格、兴趣与择偶期待，寻找符合需求的候选人。"],
  ["人工筛选和匹配", "根据个人画像与交友需求，由运营人工筛选候选人并进行匹配。"],
  ["双方确认", "找到满意的候选人，且双方都希望继续约会安排后，再支付 ¥400 尾款。"],
  ["安排约会", "结合对应约会套餐，由运营完成首次约会介绍与安排。"],
];

export default function OneToOnePage() {
  return <main className={styles.page}>
    <div className={styles.topline}><Link href="/dashboard">← 返回</Link></div>
    <section className={styles.hero} aria-labelledby="activity-title">
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>校园里的，认真相遇</span>
        <h1 id="activity-title">先双向心动，<br />再让故事开始。</h1>
        <p>从人工登记、刻画画像，<br />到寻找满意的候选人、安排第一次约会，<br />由运营认真了解你的需求，陪你迈出认识彼此的第一步。</p>

        <span className={styles.heroNote}>在更大的世界里，遇见更合拍的你。</span>
      </div>
      <div className={`${styles.heroCta} ${styles.contactCard}`}>
        <div className={styles.contactCopy}><strong>添加运营微信咨询</strong><a href="mailto:support@lilink.top">如果您被引导至私人微信，请联系 support@lilink.top 举报，获得现金100元</a></div>
        <SocialQr channel={socialChannels[0]} className={styles.inlineQr} />
      </div>
      <div className={styles.heroArt}><Image className={styles.heroImage} src="/images/one-to-one-minimal.webp" alt="两位同学坐在长椅上轻松交流的简约插画" width={1672} height={941} priority sizes="(max-width: 700px) 600px, 1100px" /></div>
    </section>

    <section className={styles.plans} aria-label="服务方案">
      <article className={styles.plan}>
        <span className={styles.kicker}>认真了解你的期待，安排一次真实相遇</span>
        <h2>人工匹配与约会服务</h2><p className={styles.price}><span>¥</span>599<small> / 人</small></p>
        <ul><li>人工登记</li><li>人工刻画画像</li><li>人工筛选和匹配</li><li>对应约会套餐</li><li>首次约会介绍与安排</li></ul>
        <div className={styles.paymentSteps}><div><span>第一阶段 · 定金</span><strong>¥199</strong><p>服务开放后，登记并开始人工沟通、画像梳理。</p></div><div><span>第二阶段 · 尾款</span><strong>¥400</strong><p>找到满意候选人，且双方都希望跟进约会安排后支付。</p></div></div>
      </article>
    </section>

    <section id="participate" className={styles.experience} aria-labelledby="flow-title">
      <header><span className={styles.eyebrow}>从了解彼此，到认真相遇</span><h2 id="flow-title">简单的五步，<br />让相遇更自然。</h2><p>以下为服务开放后的参与流程。<br />当前仅展示方案，暂不开放登记或付款。</p></header>
      <div className={styles.experienceItems}>
        {steps.map(([title,copy], index) => <article key={title}><span className={styles.number}>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div>
    </section>
    <section className={`${faqStyles.section} ${styles.faqSection}`} aria-labelledby="activity-faq-title">
      <div className={faqStyles.inner}>
        <h2 id="activity-faq-title" className={faqStyles.title}>常见问题</h2>
        <div className={faqStyles.list}>
      <details name="activity-faq" className={faqStyles.item}><summary>¥199 定金和 ¥400 尾款分别什么时候支付？</summary><div className={faqStyles.answer}>服务开放后，先支付 ¥199 定金，开始人工登记与画像梳理。找到满意的候选人，且双方都希望跟进约会安排时，再支付 ¥400 尾款，总计 ¥599 / 人。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>约会套餐具体包含什么？</summary><div className={faqStyles.answer}>约会套餐会根据时间有所调整，具体内容请咨询运营。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>与每周免费匹配有什么区别？</summary><div className={faqStyles.answer}>人工服务包含人工画像梳理和首次约会介绍与安排。每周免费匹配继续照常进行，不要求购买人工服务；请在首页确认每周报名。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>运营引导我添加私人微信并私下付款，怎么办？</summary><div className={faqStyles.answer}>请勿向私人账号付款。若运营从 LiLink 官方运营微信引导你转到私人微信收款，请保留聊天记录和收款账号等证据，发送至 <a href="mailto:support@lilink.top">support@lilink.top</a> 举报。经核实存在此类行为，我们将向举报人奖励 100 元现金。</div></details>
        </div>
      </div>
    </section>
    <div className={styles.mobileCta}><span>人工服务 ¥599 / 人<small>定金 ¥199 + 尾款 ¥400</small></span><WechatContact compact /></div>
  </main>;
}
