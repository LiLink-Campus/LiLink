"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-shell prose-shell">
      <section
        className="content-panel auth-panel"
        style={{ textAlign: "center", padding: "4rem 2rem" }}
      >
        <p className="eyebrow">Error</p>
        <h1>出了点问题</h1>
        <p style={{ color: "var(--fg-secondary)" }}>
          {error.message || "页面加载时发生了意外错误。"}
        </p>
        <button
          className="button-primary"
          onClick={reset}
          style={{ marginTop: "1.5rem" }}
        >
          重试
        </button>
      </section>
    </main>
  );
}
