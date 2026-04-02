import Link from "next/link";

export default function AboutPage() {
  return (
    <main>
      <section className="page-hero">
        <div className="page-hero-content">
          <p className="eyebrow">About LiLink</p>
          <h1>与其无数次擦肩，不如一次认真的匹配。</h1>
          <p>{"LiLink 是面向黎安国际教育创新区的匹配平台。基于心理学量表设计的深度问卷，结合算法，每周为用户匹配一个在核心价值观、生活方式与情感风格上真正契合的人。"}</p>
          <p>
            平台不向用户收费，以公益为导向服务园区社区；若你愿意支持可持续运营，也欢迎赞助。
          </p>
        </div>
      </section>

      <section className="about-philosophy">
        <blockquote className="about-quote">
          <p>{"\u201c提高配对率或许只需算法的让步，但我们更希望认真对待每一份期待，让每一个「匹配成功」都真正具备心动的可能。\u201d"}</p>
          <cite>— LiLink 团队</cite>
        </blockquote>
      </section>

      <section className="about-features">
        <div className="section-heading">
          <p className="eyebrow">What makes us different</p>
          <h2>不是另一个交友 App</h2>
        </div>
        <div className="about-grid">
          <article className="about-card">
            <div className="about-card-icon">01</div>
            <h3>不做广场</h3>
            <p>{"没有公开用户列表，没有站内聊天，没有信息流。平台的全部注意力集中在一件事上：匹配质量。"}</p>
          </article>
          <article className="about-card">
            <div className="about-card-icon">02</div>
            <h3>不做无限滑动</h3>
            <p>{"每周一个轮次，只推送一个匹配结果和一段匹配理由。你可以自由选择是否参与下一轮，把节奏的控制权留给自己。"}</p>
          </article>
          <article className="about-card">
            <div className="about-card-icon">03</div>
            <h3>不做跨校噱头</h3>
            <p>{"在黎安国际教育创新区，多所高校共享同一园区。跨校不是目标本身，只是一条自然存在的可能性。真正重要的是契合。"}</p>
          </article>
        </div>
      </section>

      <section className="about-mechanism">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>从注册到匹配的完整路径</h2>
        </div>
        <div className="about-steps">
          <div className="about-step">
            <div className="about-step-num">1</div>
            <div>
              <h3>学校邮箱验证</h3>
              <p>仅接受园区白名单学校邮箱。通过邮箱验证码完成注册，确认你是园区社区的一员。</p>
            </div>
          </div>
          <div className="about-step">
            <div className="about-step-num">2</div>
            <div>
              <h3>填写深度问卷</h3>
              <p>基于心理学量表设计的问卷，覆盖核心价值观、人生轨迹、生活颗粒度、情感风格等维度。这些数据构成匹配算法的输入。</p>
            </div>
          </div>
          <div className="about-step">
            <div className="about-step-num">3</div>
            <div>
              <h3>每周选择参与</h3>
              <p>每个轮次独立运行，你可以在 Dashboard 自由开关参与状态。不需要永远在线，也不需要删号才能暂停。</p>
            </div>
          </div>
          <div className="about-step">
            <div className="about-step-num">4</div>
            <div>
              <h3>收到匹配与理由</h3>
              <p>轮次揭晓时，平台推送一个匹配对象和一段算法生成的匹配理由。确认联系意向后，双方交换邮箱或由平台代发引荐邮件。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-cta">
        <h2>准备好了？</h2>
        <p>填写问卷，加入下一轮匹配。</p>
        <Link className="button-primary" href="/register">
          开始匹配
        </Link>
      </section>
    </main>
  );
}
