"use client";

import { Button, Card } from "@/components/ui";
import styles from "./error.module.css";
import layoutStyles from "./public-layout.module.css";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={`${layoutStyles.pageShell} ${layoutStyles.proseShell}`}>
      <Card
        className={styles.card}
        layout="plain"
      >
        <p className="eyebrow">Error</p>
        <h1>出了点问题</h1>
        <p className={styles.message}>
          {error.message || "页面加载时发生了意外错误。"}
        </p>
        <Button
          onClick={reset}
          className={styles.action}
        >
          重试
        </Button>
      </Card>
    </main>
  );
}
