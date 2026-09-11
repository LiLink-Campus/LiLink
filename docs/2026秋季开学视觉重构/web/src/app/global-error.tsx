"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import styles from "./global-error.module.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
