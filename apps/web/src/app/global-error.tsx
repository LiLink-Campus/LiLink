"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
          background: "#fdf8f0",
          color: "#1a1210",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>
            出了点问题
          </h1>
          <p style={{ color: "#8c7a6b", marginBottom: "1.5rem" }}>
            页面加载时发生了意外错误。
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.7rem 1.5rem",
              background: "#8b3a4a",
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
