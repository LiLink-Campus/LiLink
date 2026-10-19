"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./school-logo.module.css";

type Props = { id: string; alt: string; kind: "chinese" | "foreign"; position: string;
  src: string; srcSet: string; width: number; height: number; priority: boolean };

export function SchoolAtlasImage({ id, alt, kind, position, priority, ...image }: Props) {
  const mark = useRef<HTMLSpanElement>(null);
  const [nearby, setNearby] = useState(priority);
  useEffect(() => {
    if (priority) return;
    if (!mark.current) return;
    if (!("IntersectionObserver" in window)) { setNearby(true); return; }
    // Observe the cropped mark, not the much larger translated atlas image.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: "0px" });
    observer.observe(mark.current);
    return () => observer.disconnect();
  }, [priority]);
  return <span ref={mark} className={`${styles.logo} ${styles[kind]}`} data-school-logo={kind}>
    <picture className={`${styles.crop} ${position}`}>
      {/* The source enters as one responsive set. The named img stays in the
          document without fetching a fallback atlas before its DPR candidate. */}
      {nearby && <source srcSet={image.srcSet} />}
      <img className={styles.image} src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        width={image.width} height={image.height} decoding="async" fetchPriority={priority ? "high" : undefined}
        alt={alt} data-school-id={id} aria-hidden={!nearby} />
      {!priority && <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.image} {...image} alt={alt} loading="lazy" decoding="async" />
      </noscript>}
    </picture>
  </span>;
}
