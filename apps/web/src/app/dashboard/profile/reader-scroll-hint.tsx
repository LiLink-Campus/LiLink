"use client";

import { useEffect, useState, type RefObject } from "react";
import styles from "./profile-redesign.module.css";

export function ReaderScrollHint({ readerRef, question }: {
  readerRef: RefObject<HTMLDivElement | null>;
  question: HTMLElement | undefined;
}) {
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    const update = () => {
      setHasMore(reader.clientHeight > 0 &&
        reader.scrollHeight - reader.clientHeight - reader.scrollTop > 2);
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

  return <div className={styles.scrollHint} data-visible={hasMore} aria-hidden={!hasMore}>
    <span>↓ 下方还有内容</span>
  </div>;
}
