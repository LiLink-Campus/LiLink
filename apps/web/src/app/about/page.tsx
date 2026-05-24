import { ButtonLink } from "@/components/ui";
import {
  CampusLineart,
  GrassRowIllustration,
  WheatSprigIllustration,
} from "../dashboard/_components/illustrations";
import layoutStyles from "../public-layout.module.css";
import styles from "./about.module.css";

export default function AboutPage() {
  return (
    <main>
      <section className={`${layoutStyles.pageHero} ${layoutStyles.withIllustration}`}>
        <div className={`${layoutStyles.pageHeroContent} animate-in`}>
          <p className="eyebrow">About LiLink</p>
          <h1 className="text-balance">
            与其无数次擦肩，不如一次认真的匹配
          </h1>
          <p>
            LiLink 是面向高校学生的匹配平台。基于心理学量表设计的深度问卷，结合算法，每周为你寻找一个在核心价值观、生活方式与情感风格上真正契合的同学。
          </p>
          <p>
            平台不向用户收费，以公益方式运营校园社区；首期合作高校陆续上线，后续会逐步扩展到更多校园与园区。
          </p>
        </div>
        <div className={layoutStyles.pageHeroIllustration} aria-hidden="true">
          <CampusLineart />
        </div>
      </section>

      <section className={styles.philosophy}>
        <blockquote className={styles.quote}>
          <p>
            「提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待，让每一个『匹配成功』都真正具备心动的可能。」
          </p>
          <cite>— LiLink 团队</cite>
        </blockquote>
      </section>

      <section className={styles.features}>
        <div className={layoutStyles.sectionHeading}>
          <p className="eyebrow">What makes us different</p>
          <h2>不是另一个交友 App</h2>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardIcon}>01</div>
            <h3>不做广场</h3>
            <p>
              没有公开用户列表，没有站内聊天，没有信息流。平台的全部注意力集中在一件事上：匹配质量。
            </p>
          </article>
          <article className={styles.card}>
            <div className={styles.cardIcon}>02</div>
            <h3>不做无限滑动</h3>
            <p>
              每周一个轮次，只推送一个匹配结果和一段匹配理由。你可以自由选择是否参与下一轮，把节奏的控制权留给自己。
            </p>
          </article>
          <article className={styles.card}>
            <div className={styles.cardIcon}>03</div>
            <h3>不做跨校噱头</h3>
            <p>
              同校与跨校被平等对待。你可以在「希望 TA」中按学校、性别、身高、颜值等条件自由筛选；算法关心的，始终是契合度本身。
            </p>
          </article>
        </div>
      </section>

      <section className={styles.mechanism}>
        <div className={layoutStyles.sectionHeading}>
          <p className="eyebrow">How it works</p>
          <h2>从注册到匹配的完整路径</h2>
        </div>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div>
              <h3>学校邮箱验证</h3>
              <p>
                仅接受合作高校的学校邮箱。通过邮箱验证码完成注册，确认你是校园里的同学。
              </p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div>
              <h3>填写深度问卷</h3>
              <p>
                基于心理学量表设计的问卷，覆盖核心价值观、人生轨迹、生活颗粒度、情感风格等维度。这些数据构成匹配算法的输入。
              </p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div>
              <h3>每周选择参与</h3>
              <p>
                每个轮次独立运行，你可以在「我的匹配」里自由开关参与状态。不需要永远在线，也不需要删号才能暂停。
              </p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNum}>4</div>
            <div>
              <h3>收到匹配与理由</h3>
              <p>
                轮次揭晓时，平台推送一个匹配对象和一段算法生成的匹配理由。确认联系意向后，由平台代发引荐邮件。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.cta}>
        <div className={styles.ctaIllustration} aria-hidden="true">
          <WheatSprigIllustration />
        </div>
        <h2>
          准备好了<span className="optical-punct">？</span>
        </h2>
        <p>填写问卷，加入下一轮匹配。</p>
        <ButtonLink href="/dashboard">
          开始匹配
        </ButtonLink>
      </section>

      <section className={layoutStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </section>
    </main>
  );
}
