"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./ImageReadyPage.module.css";

/** Reveal the page after its first-screen artwork has decoded. */
export function ImageReadyPage({ children, className, background }: {
  children: ReactNode;
  className?: string;
  background?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const images = Array.from(ref.current?.querySelectorAll<HTMLImageElement>("img[data-page-image]") ?? []);
    if (background) {
      const image = new Image();
      image.src = background;
      images.push(image);
    }
    const reveal = () => { if (!cancelled) setReady(true); };
    // A failed or stalled image must never block the page indefinitely.
    const timeout = window.setTimeout(reveal, 8000);
    void Promise.allSettled(images.map(image => image.decode())).then(() => {
      window.clearTimeout(timeout);
      reveal();
    });
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [background]);

  return <main ref={ref} className={`${className ?? ""} ${styles.page}`} aria-busy={!ready} data-image-ready={ready}>
    {!ready && <span className={styles.loading} role="status">正在加载页面…</span>}
    {children}
    <noscript><style>{`main[data-image-ready="false"] > * { visibility: visible !important; } main[data-image-ready="false"] > [role="status"] { display: none; }`}</style></noscript>
  </main>;
}
