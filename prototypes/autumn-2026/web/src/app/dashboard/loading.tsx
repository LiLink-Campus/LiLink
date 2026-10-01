import styles from "./loading.module.css";

export default function DashboardLoading() {
  return (
    <div
      className={`${styles.pageShell} ${styles.loadingShell}`}
      aria-busy="true"
      aria-label="正在加载 Dashboard"
    >
      <section className={styles.pageHeader}>
        <div className={styles.pill} />
        <div className={`${styles.line} ${styles.title}`} />
        <div className={styles.line} />
        <p className={styles.status}>正在加载…</p>
      </section>

      <section className={styles.grid}>
        <div className={`ui-card ui-card--padded ${styles.card}`}>
          <div className={`${styles.line} ${styles.short}`} />
          <div className={styles.block} />
          <div className={styles.line} />
        </div>
        <div className={`ui-card ui-card--padded ${styles.card}`}>
          <div className={`${styles.line} ${styles.short}`} />
          <div className={styles.block} />
          <div className={styles.line} />
        </div>
      </section>
    </div>
  );
}
