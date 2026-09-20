"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { GlobalErrorView } from "./global-error-view";
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
        <GlobalErrorView reset={reset} />
      </body>
    </html>
  );
}
