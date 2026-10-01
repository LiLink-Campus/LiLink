import styles from "./about.module.css";

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.masthead}>
          <div className={styles.campusArt} aria-hidden="true" />
          <div className={styles.intro}>
            <h1>关于 LiLink</h1>
            <p className={styles.meta}>
              校园里的，认真相遇。我们是一个由三位伙伴共同建设的小团队，
              希望用一份认真填写的问卷，为熟悉的校园生活带来新的相识。
              从第一次了解，到愿意走近彼此，让每一份期待都有被认真对待的机会。
            </p>
            <p className={styles.mobileIntro}>
              校园里的，认真相遇。<br />
              三位伙伴，一份共同的期待。<br />
              让认真相识的机会，走进日常校园。
            </p>
          </div>
        </header>

        <section className={styles.section} aria-labelledby="story-title">
          <h2 id="story-title">我们的故事</h2>
          <div className={styles.storyLayout}>
            <div className={styles.storyVisual}>
              <blockquote className={styles.storyQuote}>与其无数次擦肩，<br />不如一次认真的匹配。</blockquote>
              <div className={styles.botanicalArt} aria-hidden="true" />
            </div>
            <div className={styles.prose}>
            <p>
              LiLink 是面向高校学生的匹配平台。我们希望在日常校园生活里，为认真认识彼此留出一个机会。
              通过基于心理学量表设计的深度问卷，结合匹配算法，每周为你寻找一个在核心价值观、生活方式与情感风格上契合的同学。
            </p>
            <p>
              在覆盖广度与心灵深度之间，我们选择后者。提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待，让每一个匹配成功都真正具备心动的可能。
            </p>
            <p>
              平台负责认真寻找，并在双方同意后完成引荐。接下来如何认识、怎样走近，由你们自己决定。
            </p>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="team-title">
          <h2 id="team-title">团队</h2>
          <div className={styles.prose}>
            <p>我们相信，好的关系，源于尊重与真诚。这也是 LiLink 设计与运营的出发点。</p>
          </div>
          <div className={styles.teamGrid}>
            {[1, 2, 3].map((member) => (
              <article key={member} className={styles.member} aria-label={`团队成员 ${member}，资料待补充`}>
                <div className={styles.memberHead}>
                  <div className={styles.avatarPlaceholder} aria-label="动漫头像待补充">
                    <span>动漫头像<br />待补充</span>
                  </div>
                  <div>
                    <h3>成员 {String(member).padStart(2, "0")}</h3>
                    <p className={styles.memberRole}>姓名 · 职责待补充</p>
                  </div>
                </div>
                <div className={styles.memberDetails}>
                  <p className={styles.memberBio}>个人介绍待补充</p>
                  <p className={styles.memberNote}>在这里分享自己的背景、关注的事，以及参与 LiLink 的初衷。</p>
                </div>
              </article>
            ))}
          </div>
          <div className={`${styles.prose} ${styles.teamFoot}`}>
            <p>
              LiLink 不向用户收费，以公益方式运营校园社区。合作高校陆续上线，我们也会继续完善体验，让更多校园里的同学有机会认真相遇。
            </p>
          </div>
        </section>

        <section className={`${styles.section} ${styles.contactSection}`} aria-labelledby="contact-title">
          <div className={styles.petalsArt} aria-hidden="true" />
          <h2 id="contact-title">联系我们</h2>
          <div className={styles.prose}>
            <p>
              无论是使用中的问题、对产品的建议，还是校园合作与加入团队的想法，我们都愿意听你说。
              也欢迎和我们分享，你在 LiLink 的相遇故事。
            </p>
          </div>
          <dl className={styles.contactList}>
            <div><dt><span className={`${styles.contactIcon} ${styles.mailIcon}`} aria-hidden="true" />联系邮箱</dt><dd>待补充</dd></div>
            <div><dt><span className={`${styles.contactIcon} ${styles.wechatIcon}`} aria-hidden="true" />微信</dt><dd>二维码待补充</dd></div>
            <div><dt><span className={`${styles.contactIcon} ${styles.rednoteIcon}`} aria-hidden="true" />小红书</dt><dd>二维码待补充</dd></div>
          </dl>
        </section>
      </div>
    </main>
  );
}
