import styles from "./legal-document.module.css";

type Section = { id: string; title: string; paragraphs: string[] };

export function LegalDocument({ kind, title, summary, sections }: {
  kind: "terms" | "privacy";
  title: string;
  summary: string;
  sections: Section[];
}) {
  return <main className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>信任与约定</p>
      <h1>{title}</h1>
      <p className={styles.summary}>{summary}</p>
      <p className={styles.summary}>注册 LiLink 账号即表示你已阅读并同意《用户协议》和《隐私政策》。依法需要单独征求同意的事项，我们会另行征求你的同意。</p>
      <p className={styles.meta}>更新于 2026 年 9 月 17 日</p>
    </header>
    <div className={styles.layout}>
      <article className={styles.article} aria-label={title}>
        {sections.map((section, index) => <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{section.title}</h2>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph.startsWith("重要提示：") ? <strong>{paragraph}</strong> : paragraph}</p>)}
          {kind === "privacy" && section.id === "providers" && <p>
            <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel 统计隐私说明 ↗</a>
            {" · "}<a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">Sentry 隐私政策 ↗</a>
          </p>}
        </section>)}
      </article>
    </div>
  </main>;
}
