"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./social-floater.module.css";

const storageKey = "lilink-social-floater-dismissed";
const today = () => new Date().toLocaleDateString("en-CA");

export function SocialFloater() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(storageKey) !== today());
    } catch {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!visible) return null;

  return (
    <div
      ref={root}
      className={styles.floater}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.close}
        title="今日不再显示"
        aria-label="关闭关注条，今日不再显示"
        onClick={() => {
          try {
            localStorage.setItem(storageKey, today());
          } catch {
            /* Storage may be unavailable. */
          }
          setVisible(false);
        }}
      >
        ×
      </button>
      <button
        ref={trigger}
        type="button"
        className={styles.tab}
        aria-expanded={open}
        aria-controls="social-floater-panel"
        onClick={(event) => {
          if (event.detail > 0 && window.matchMedia("(hover: hover) and (pointer: fine)").matches) setOpen(true);
          else setOpen((value) => !value);
        }}
      >
        想获知关于我们的更多信息？
      </button>
      <section
        id="social-floater-panel"
        className={styles.panel}
        hidden={!open}
        aria-label="关注 LiLink"
      >
        {["微信", "小红书"].map((channel) => (
          <figure className={styles.channel} key={channel}>
            <div className={styles.placeholder} role="img" aria-label={`${channel}二维码待补充`}>
              <span aria-hidden="true">＋</span>
              <small>二维码待补充</small>
            </div>
            <figcaption>{channel}</figcaption>
          </figure>
        ))}
      </section>
    </div>
  );
}
