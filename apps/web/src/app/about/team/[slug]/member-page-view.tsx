import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

export function MemberPageView({ slug }: { slug: "yoryon" | "member-02" }) {
  const founder = slug === "yoryon";
  return <main className={styles.page}>
    <Link className={styles.back} href="/about#team-title">← 返回团队</Link>
    <header className={styles.header}>
      {founder ? <Image className={styles.avatar} src="/images/about/member-01.png" alt="釉蓝yoryon 的黑色轨道箭头头像" width={112} height={112} /> : <Image className={`${styles.avatar} ${styles.photo}`} src="/images/about/member-02.jpg" alt="蟹牛堡 的头像" width={112} height={112} />}
      <div><h1>{founder ? "釉蓝yoryon" : "蟹牛堡"}</h1><p>{founder ? "创始人 & 产品负责人" : "增长 & 运营负责人"}</p></div>
    </header>
    {founder && (                <div className={`${styles.socials} ${styles.founderSocials}`} aria-label="釉蓝yoryon 的社交媒体">
                  <a href="https://yoryon.com" target="_blank" rel="noopener noreferrer">个人主页 ↗</a>
                  <a href="https://github.com/nanzhi84" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
                  <span>公众号（同名）</span>
                  <a href="https://www.xiaohongshu.com/user/profile/649ade98000000001001d1dc" target="_blank" rel="noopener noreferrer">小红书 ↗</a>
                  <a href="https://www.douyin.com/user/MS4wLjABAAAAKYi5Z7LC-1B1YgY8kYdN2DrKqwtdTvZ4I0lodLekyOs" target="_blank" rel="noopener noreferrer">抖音 ↗</a>
                </div>)}
    {!founder && <div className={styles.socials} aria-label="蟹牛堡 的社交媒体">
      <a href="https://www.xiaohongshu.com/user/profile/66acce55000000001d032745" target="_blank" rel="noopener noreferrer">小红书 ↗</a>
      <span className={styles.wechat}>个人微信号<span>LiuFengrui0225</span></span>
    </div>}
    <section className={styles.bio}>
      {founder ? <>
        <blockquote className={styles.introQuote}>
          <p>我曾以为，最远的旅程是从家到学校，从学校到社会，从社会到远方。后来才明白，最远的旅程，是从自己到自己。</p>
        </blockquote>
        <div className={styles.introText}>
          <p>大三休学中。<br />希望用一段时间探索自己真正想要的生活。</p>
          <p>玻璃心，抗压能力一般，容易内耗，经常想太多。<br />慢慢学着接受失败、接受不确定，也接受自己的平凡。</p>
          <p>我希望有一天，自己能拥有三种自由：<br /><strong className={styles.freedom}>随时离开的能力，随时重新开始的能力，以及按照自己认可的方式生活的能力。</strong></p>
          <p className={styles.writingNote}>抖音和小红书偶尔更新一些日记、碎碎念和无病呻吟。<br />个人主页、公众号写点正常的技术博客。</p>
        </div>
      </> : <div className={styles.introText}>
        <p>我是lilink的主要增长和运营负责人。</p>
        <p>平常喜欢健身，游戏，当然也很喜欢交朋友。</p>
        <p>在校期间参与项目整体运营工作，负责用户咨询、活动落地、用户资料审核与匹配跟进，兼顾社群维护和团队内部沟通协调。</p>
        <p>我理解大学生真实的交友需求，坚持真诚、安全的原则，为校内同学搭建靠谱的相遇渠道。</p>
        <p>日常对接用户，耐心倾听诉求，及时处理疑问与反馈，把控平台交友氛围。同时参与项目迭代讨论，梳理运营流程，配合团队推进每期配对活动。</p>
        <p>希望依托lilink，帮更多校园里的单身同学遇见同频的人，创造轻松、尊重的校园交友空间。</p>
      </div>}
    </section>
  </main>;
}
