import { RegistrationButton } from "./registration";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";
import faqStyles from "../faq/faq.module.css";

export const metadata: Metadata = {
  title: "1 对 1 恋爱匹配 · LiLink",
  description: "登记与查看介绍均免费。双方互选、都想进一步了解后，再付费交换联系方式，开启专人牵线或 7 天恋爱挑战。",
};

const steps = [
  ["免费登记", "免费留下你的情况与期待，由运营了解你的交友意向。"],
  ["查看介绍", "免费查看多位候选人介绍，选择你想进一步了解的人。"],
  ["双向确认", "彼此选中后，再分别确认是否愿意交换联系方式、进一步了解。"],
  ["付费开启", "双方都愿意后，按所选方案付费交换联系方式，由运营建群破冰。"],
];

export default function OneToOnePage() {
  return <main className={styles.page}>
    <div className={styles.topline}><Link href="/dashboard">← 返回</Link></div>
    <section className={styles.hero} aria-labelledby="activity-title">
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>校园里的，认真相遇</span>
        <h1 id="activity-title">先双向心动，<br />再让故事开始。</h1>
        <p>登记、查看介绍，全程免费。<br />只有彼此选中、都想进一步了解，才按人付费交换联系方式，由运营牵线破冰。<br />单向喜欢或任何一方不想继续，都不收费；付款前会确认服务内容。</p>

        <span className={styles.heroNote}>在更大的世界里，遇见更合拍的你。</span>
      </div>
      <RegistrationButton className={`${styles.primary} ${styles.heroCta}`} />
      <div className={styles.heroArt}><Image className={styles.heroImage} src="/images/one-to-one-minimal.webp" alt="两位同学坐在长椅上轻松交流的简约插画" width={1672} height={941} priority sizes="(max-width: 700px) 600px, 1100px" /></div>
    </section>

    <section className={styles.plans} aria-label="服务方案">
      <article className={styles.plan}>
        <span className={styles.kicker}>一次认真介绍，自由慢慢靠近</span>
        <h2>专人牵线</h2><p className={styles.price}><span>¥</span>299<small> / 人</small></p>
        <ul><li>经双方同意交换联系方式</li><li>运营建立三人小群，介绍双方</li><li>协助首次聊天破冰</li></ul>
        <p className={styles.planFoot}>从第一句你好开始，之后由你们自由交流。</p>
      </article>
      <article className={`${styles.plan} ${styles.challenge}`}>
        <span className={styles.ribbon}>多一点陪伴</span>
        <span className={styles.kicker}>给彼此 7 天认真了解的机会</span>
        <h2>7 天恋爱挑战</h2><p className={styles.price}><span>¥</span>599<small> / 人</small></p>
        <ul><li>包含专人牵线全部服务</li><li><strong>首次约会介绍与安排</strong></li><li><strong>对应约会套餐</strong></li><li>7 天互动与运营跟进</li></ul>
        <div className={styles.reward}>在一起并完成故事投稿<br /><strong>每人返 ¥300</strong></div>
        <p className={styles.fine}>约会套餐具体内容待确认，报名开放前公布。</p>
      </article>
    </section>

    <section id="participate" className={styles.experience} aria-labelledby="flow-title">
      <header><span className={styles.eyebrow}>从了解彼此，到认真相遇</span><h2 id="flow-title">简单的四步，<br />让相遇更自然。</h2><p>先免费了解，双向确认后再付费。<br />由运营陪你们迈出认识彼此的第一步。</p></header>
      <div className={styles.experienceItems}>
        {steps.map(([title,copy], index) => <article key={title}><span className={styles.number}>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div>
    </section>
    <section className={`${faqStyles.section} ${styles.faqSection}`} aria-labelledby="activity-faq-title">
      <div className={faqStyles.inner}>
        <h2 id="activity-faq-title" className={faqStyles.title}>常见问题</h2>
        <div className={faqStyles.list}>
      <details name="activity-faq" className={faqStyles.item}><summary>介绍后，对方拒绝沟通怎么办？</summary><div className={faqStyles.answer}>运营会先向双方介绍彼此的基本信息，分别确认你们都愿意进一步了解，再安排交换联系方式和拉群破冰。提前做好双向确认，是为了尽量避免介绍后不愿沟通的情况。<br /><br />如果介绍完成后 72 小时内，对方仍明确拒绝建立任何沟通，且原因并非你的行为导致，提供相关证据后，我们会免费为你补充一次人工匹配。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>故事如何投稿？返还如何申请？</summary><div className={faqStyles.answer}>双方确认在一起并完成故事投稿后，每人可返 ¥300。投稿使用网名，公开内容须经双方确认。</div></details>
      <details name="activity-faq" className={faqStyles.item}><summary>与每周免费匹配有什么区别？</summary><div className={faqStyles.answer}>本活动提供独立的人工牵线与约会服务。每周免费匹配继续照常进行，不要求购买本活动服务。</div></details>
        </div>
      </div>
    </section>
    <div className={styles.mobileCta}><span>登记与看介绍免费<small>双向愿意，再付费</small></span><RegistrationButton className={styles.primary} /></div>
  </main>;
}
