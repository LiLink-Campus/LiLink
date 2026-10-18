"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SocialQr, socialChannels } from "../_components/SocialQr";
import styles from "./page.module.css";
import referenceStyles from "../one-to-one/page.module.css";
import { ImageReadyPage } from "../_components/ImageReadyPage";
import { Button } from "@/components/ui";

const offers = [
  { name: "牛约", category: "一起吃饭", title: "吃饭时，多一份小惊喜", intro: "点一桌喜欢的，把聊天的时间留长一点。", rules: ["满50元，送薯条一份。", "满100元，赠品三选二：薯条一份、任意咖啡一杯、牛乳布丁一份。", "满200元，送指定小食任选两份和咖啡一杯。"], note: "赠品档位能否叠加、指定小食范围待确认。", mark: "🍔", scene: "burger" },
  { name: "Vibes", category: "双人晚餐", title: "把“下次吃饭”变成一次见面", intro: "找个时间，坐下来边吃边聊。", rules: ["凭 LiLink 注册，可购买 LiLink 联名双人海陆大餐。"], note: "套餐价格与具体菜品待确认。", mark: "🍴", scene: "seafood" },
  { name: "Social", category: "一起手作", title: "一起慢慢拼好一件小事", intro: "挑个喜欢的图案，也给彼此留一点慢慢熟悉的时间。", rules: ["凭 LiLink 注册，可优惠购买双人拼豆服务。"], note: "优惠价格、服务时长与预约方式待确认。", mark: "🎨", scene: "craft" },
  { name: "玩学家工坊", category: "双人游戏", title: "一起玩几局，就多一点默契", intro: "从一局游戏开始，找到你们的共同节奏。", rules: ["凭 LiLink 注册，享 PS5 特色双人游戏服务满减优惠：", "满50减5，满75减20，满100减30。"], note: "适用游戏、服务时长与预约方式待确认。", mark: "🎮", scene: "games" },
] as const;

export default function MeetupsPage() {
  const display = useRef<HTMLDialogElement>(null);
  const contact = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<(typeof offers)[number]>(offers[0]);
  function showOffer(offer: (typeof offers)[number]) {
    setSelected(offer);
    display.current?.showModal();
  }
  return <ImageReadyPage className={styles.page} background="/images/meetups/scene-atlas.png">
    <div className={referenceStyles.topline}><Link href="/dashboard">← 返回</Link></div>
    <section className={styles.hero}>
      <div className={styles.heroPhoto}><div className={`${styles.scene} ${styles.cafe}`} role="img" aria-label="阳光下与朋友一起用餐的示意图片" /></div>
      <div className={styles.heroCopy}><span className={referenceStyles.eyebrow}>校园里的，认真相遇</span><h1>下一次见面，<br />多一个好去处。</h1><p>吃饭、手作、游戏，给见面一个理由。</p><a className={styles.hint} href="#offers"><span aria-hidden="true">⌖</span> 无需领券 · 到店出示</a></div>
    </section>
    <section id="offers" className={styles.offers} aria-label="四个见面好去处">
      <div className={styles.grid}>{offers.map(offer => <article key={offer.name} className={styles.card}>
        <div className={styles.photo}><div className={`${styles.scene} ${styles[offer.scene]}`} role="img" aria-label={`${offer.category}场景示意图`} /><span className={styles.imageNote}>* 图片仅为示意</span></div>
        <div className={styles.cardCopy}>
          <div className={styles.merchant}><h2>{offer.name}</h2><Button size="sm" shape="rounded" elevation="flat" className={styles.showButton} onClick={() => showOffer(offer)}>到店出示 <span aria-hidden="true">↗</span></Button></div>
          <p className={styles.tagline}>{offer.title}</p>
          <ul className={`${styles.rules} ${offer.scene === "games" ? styles.gameRules : ""}`}>{offer.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
          <details className={styles.details}><summary>使用说明与待确认信息</summary><p>{offer.note}</p><p>门店地址、活动日期及是否与其他优惠同享待确认。本地预览不作为实际优惠凭证。</p></details>
        </div>
      </article>)}</div>
    </section>
    <section className={styles.contactSection} aria-labelledby="contact-title">
      <div className={`${styles.scene} ${styles.friends} ${styles.friendsArt}`} role="img" aria-label="四位校园朋友并肩坐在一起的插画" />
      <div className={styles.contactCopy}><h2 id="contact-title">下次，想认识更多朋友？</h2><p>聚餐、桌游、探店，有合适的局一起玩。</p><Button shape="rounded" elevation="flat" className={styles.primary} onClick={() => contact.current?.showModal()}><svg width="25" height="23" viewBox="0 0 30 26" fill="currentColor" aria-hidden="true"><path d="M12 2C6 2 1 6 1 11c0 3 2 6 5 7l-1 4 5-3h2c6 0 11-4 11-8S18 2 12 2Zm-4 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm8 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/><path d="M24 9c3 2 5 4 5 7 0 2-1 5-4 6l1 3-4-2h-2c-4 0-8-3-8-6 6 0 11-3 12-8Z"/></svg>添加运营微信 <span className={styles.visuallyHidden}>↗</span></Button><small>自愿添加，按兴趣邀请进群</small></div>
    </section>
    <p className={styles.footer}>本地设计预览 · 活动细节待确认</p>
    <dialog ref={display} className={styles.dialog} aria-labelledby="display-title"><button className={styles.close} aria-label="关闭出示卡" onClick={() => display.current?.close()}>×</button><span className={styles.eyebrow}>LiLink · 到店出示</span><h2 id="display-title">{selected.name}</h2><p>{selected.title}</p><ul className={styles.displayRules}>{selected.rules.map(rule => <li key={rule}>{rule}</li>)}</ul><div className={styles.previewNotice}><strong>本地预览 · 暂不可作为优惠凭证</strong><p>正式活动时间与使用条件待确认；需凭 LiLink 注册的优惠，届时请同时展示账号页面。</p></div><button className={styles.dialogContact} onClick={() => { display.current?.close(); contact.current?.showModal(); }}>之后一起组局？添加运营微信 ↗</button></dialog>
    <dialog ref={contact} className={styles.dialog} aria-labelledby="wechat-title"><button className={styles.close} aria-label="关闭微信弹窗" onClick={() => contact.current?.close()}>×</button><span className={styles.eyebrow}>先认识，之后一起玩</span><h2 id="wechat-title">添加 LiLink 运营微信</h2><p>聚餐、桌游、探店，你更想参加哪一种？<br />加好友后可以直接告诉我们。</p><div className={styles.qr}><SocialQr channel={socialChannels[0]} /></div><p className={styles.qrHelp}>点击二维码可打开原图保存，再到微信扫一扫相册识别。</p><div className={styles.previewNotice}>申请备注建议：LiLink＋学校<br />先添加好友，具体活动群再按兴趣邀请。</div></dialog>
  </ImageReadyPage>;
}
