import { StaticImage } from "@/components/StaticImage";
import Link from "next/link";
import styles from "./page.module.css";

export function MemberPageView({ slug }: { slug: "yoryon" | "member-02" | "devillord6321" }) {
  const devil = slug === "devillord6321";
  const founder = slug === "yoryon";
  return <main className={styles.page}>
    <Link prefetch={false} className={styles.back} href="/about#team-title">← 返回团队</Link>
    <header className={styles.header}>
      {founder ? <StaticImage className={`${styles.avatar} ${styles.photo}`} src="/images/about/yoryon.f1f0a575ff59.webp" alt="釉蓝yoryon 的蓝色插画头像" width={112} height={112} /> : <StaticImage className={`${styles.avatar} ${styles.photo}`} src={devil ? "/images/about/devillord6321.016e14db36ed.webp" : "/images/about/member-02.b6fbc6031cdb.webp"} alt={devil ? "Devillord6321 的猫咪头像" : "蟹牛堡 的头像"} width={112} height={112} />}
      <div><h1>{founder ? "釉蓝yoryon" : devil ? "Devillord6321" : "蟹牛堡"}</h1><p>{founder ? "创始人 & 产品负责人" : "增长 & 运营负责人"}</p></div>
    </header>
    {founder && <div className={styles.socials}>
      <a href="https://yoryon.com" target="_blank" rel="noopener noreferrer">个人主页 ↗</a>
    </div>}
    {!founder && !devil && <div className={styles.socials} aria-label="蟹牛堡 的社交媒体">
      <a href="https://www.xiaohongshu.com/user/profile/66acce55000000001d032745" target="_blank" rel="noopener noreferrer">小红书 ↗</a>
      <span className={styles.wechat}>工作微信号<span>LiuFengrui0225</span></span>
    </div>}
    {devil && <div className={styles.socials}><a href="https://github.com/Devillord6321" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>}
    {!founder && <section className={styles.bio}>
      {devil ? <div className={styles.introText}><p>Double Fine用了半辈子探索人们眼中的天空会是什么颜色，佢嘚没有找到答案，但是创造了震撼人心的作品</p></div> : <div className={styles.introText}>
        <p>我是lilink的主要增长和运营负责人。</p>
        <p>平常喜欢健身，游戏，当然也很喜欢交朋友。</p>
        <p>在校期间参与项目整体运营工作，负责用户咨询、活动落地、用户资料审核与匹配跟进，兼顾社群维护和团队内部沟通协调。</p>
        <p>我理解大学生真实的交友需求，坚持真诚、安全的原则，为校内同学搭建靠谱的相遇渠道。</p>
        <p>日常对接用户，耐心倾听诉求，及时处理疑问与反馈，把控平台交友氛围。同时参与项目迭代讨论，梳理运营流程，配合团队推进每期配对活动。</p>
        <p>希望依托lilink，帮更多校园里的单身同学遇见同频的人，创造轻松、尊重的校园交友空间。</p>
      </div>}
    </section>}
  </main>;
}
