"use client";

import { useLocale } from "./locale-context";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const copy =
    locale === "zh-CN"
      ? {
          title: "出了点问题",
          fallback: "页面加载时发生了意外错误。",
          retry: "重试",
        }
      : {
          title: "Something went wrong",
          fallback: "An unexpected error happened while loading the page.",
          retry: "Try again",
        };

  return (
    <main className="page-shell prose-shell">
      <section
        className="content-panel auth-panel"
        style={{ textAlign: "center", padding: "4rem 2rem" }}
      >
        <p className="eyebrow">Error</p>
        <h1>{copy.title}</h1>
        <p style={{ color: "var(--fg-secondary)" }}>
          {error.message || copy.fallback}
        </p>
        <button
          className="button-primary"
          onClick={reset}
          style={{ marginTop: "1.5rem" }}
        >
          {copy.retry}
        </button>
      </section>
    </main>
  );
}
