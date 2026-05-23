"use client";

import styles from "./global-error.module.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className={styles.body}>
        <div>
          <h1 className={styles.title}>出了点问题</h1>
          <p className={styles.message}>
            页面加载时发生了意外错误。
          </p>
          <button
            onClick={reset}
            className={styles.action}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
