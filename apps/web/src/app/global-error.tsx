"use client";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          background: "#f4f1ea",
          color: "#18241d",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>
            出了点问题
          </h1>
          <p style={{ color: "#5a6760", marginBottom: "1.5rem" }}>
            页面加载时发生了意外错误。
          </p>
          <button
            onClick={unstable_retry}
            style={{
              padding: "0.7rem 1.5rem",
              background: "#2f5b43",
              color: "white",
              border: "none",
              borderRadius: "999px",
              cursor: "pointer",
              fontSize: "0.95rem",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
