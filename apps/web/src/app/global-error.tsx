"use client";

import type { SupportedLocale } from "@lilink/shared";
import { readClientLocale, textForLocale } from "../lib/i18n";

type GlobalErrorCopy = {
  title: string;
  body: string;
  retry: string;
};

const GLOBAL_ERROR_COPY = {
  "zh-CN": {
    title: "出了点问题",
    body: "页面加载时发生了意外错误。",
    retry: "重试",
  },
  "en-US": {
    title: "Something went wrong",
    body: "An unexpected error occurred while loading the page.",
    retry: "Try again",
  },
} satisfies Record<SupportedLocale, GlobalErrorCopy>;

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isAdminRoute =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");
  const locale = isAdminRoute ? "zh-CN" : readClientLocale();
  const copy = textForLocale(locale, GLOBAL_ERROR_COPY);

  return (
    <html lang={locale}>
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
            {copy.title}
          </h1>
          <p style={{ color: "#5a6760", marginBottom: "1.5rem" }}>
            {copy.body}
          </p>
          <button
            onClick={reset}
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
            {copy.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
