"use client";

import { useEffect, useState, type RefObject } from "react";
import styles from "./profile-redesign.module.css";

type ScrollDirection = "none" | "up" | "down" | "both";

export function ReaderScrollHint({ readerRef, question }: {
  readerRef: RefObject<HTMLDivElement | null>;
  question: HTMLElement | undefined;
}) {
  const [direction, setDirection] = useState<ScrollDirection>("none");

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    const update = () => {
      const above = reader.scrollTop > 2;
      const below = reader.scrollHeight - reader.clientHeight - reader.scrollTop > 2;
      setDirection(reader.clientHeight === 0 || reader.scrollHeight <= reader.clientHeight + 2
        ? "none" : above ? below ? "both" : "up" : "down");
    };
    const observer = new ResizeObserver(update);
    observer.observe(reader);
    if (question) observer.observe(question);
    reader.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      reader.removeEventListener("scroll", update);
    };
  }, [readerRef, question]);

  return <div className={styles.scrollHint} data-direction={direction} aria-hidden={direction === "none"}>
    <span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {direction === "up" || direction === "both" ? <path d="m7 9 5-5 5 5" /> : null}
        {direction === "down" || direction === "both" ? <path d="m7 15 5 5 5-5" /> : null}
      </svg>
      {direction === "both" ? "上下还有内容 · 滑动查看" : direction === "up" ? "上方还有内容 · 滑动查看" : "下方还有内容 · 滑动查看"}
    </span>
  </div>;
}
