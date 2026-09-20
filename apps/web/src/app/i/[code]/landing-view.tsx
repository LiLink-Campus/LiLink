import styles from "./landing.module.css";

export function ReferralLandingView({ valid }: { valid: boolean | null }) {
  return (
    <main className={styles.center}>
      <div className={styles.card}>
        {valid === false ? (
          <>
            <h1 className={styles.title}>邀请链接无法识别</h1>
            <p className={styles.text}>
              该邀请码无效、不可用或已过期，你仍然可以直接注册加入 LiLink。
            </p>
            <a className={styles.cta} href="/register">
              前往注册
            </a>
          </>
        ) : valid === true ? (
          <>
            <h1 className={styles.title}>欢迎加入 LiLink</h1>
            <p className={styles.text}>正在为你跳转到注册页……</p>
            <a className={styles.cta} href="/register/personal">
              没有自动跳转？点此注册
            </a>
          </>
        ) : (
          <>
            <h1 className={styles.title}>正在验证邀请链接……</h1>
            <p className={styles.muted}>请稍候</p>
          </>
        )}
      </div>
    </main>
  );
}
