"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale } from "./locale-context";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [pending, startTransition] = useTransition();
  const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
  const targetLabel = locale === "zh-CN" ? "EN" : "中文";

  async function handleClick() {
    await setLocale(nextLocale);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="locale-switcher"
      aria-label={locale === "zh-CN" ? "Switch to English" : "切换到中文"}
      disabled={pending}
      onClick={() => void handleClick()}
    >
      <svg
        className="locale-switcher-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.8 9h16.4M3.8 15h16.4" />
        <path d="M12 3.5c2.1 2.1 3.2 5 3.2 8.5s-1.1 6.4-3.2 8.5" />
        <path d="M12 3.5C9.9 5.6 8.8 8.5 8.8 12s1.1 6.4 3.2 8.5" />
      </svg>
      <span>{targetLabel}</span>
    </button>
  );
}
