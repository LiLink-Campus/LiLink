"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./artwork-frame.module.css";

/** Artwork readiness affects only its own fade; copy is always server-visible. */
export function ArtworkFrame({ children, className }: { children: ReactNode; className: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const image = frame.current?.querySelector("img");
    if (!image) return;
    let active = true;
    const reveal = () => { if (active) setReady(true); };
    // A broken image keeps the CSS preview without affecting any other content.
    void image.decode().then(reveal, () => {});
    image.addEventListener("load", reveal);
    return () => { active = false; image.removeEventListener("load", reveal); };
  }, []);
  return <div ref={frame} className={`${className} ${styles.frame}`} data-artwork-ready={ready}>
    {children}
    <noscript><style>{`[data-artwork-ready] img { opacity: 1 !important; }`}</style></noscript>
  </div>;
}
