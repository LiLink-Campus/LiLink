"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { announcements } from "./announcements";
import styles from "./announcement-dialog.module.css";

const SEEN_KEY = "lilink_seen_announcement";

function readSeenAnnouncementId() {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function rememberSeenAnnouncement(id: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, id);
  } catch {
    return;
  }
}

export function AnnouncementDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const latest = announcements[0];

  useEffect(() => {
    if (!latest) return;

    const seen = readSeenAnnouncementId();
    if (seen === latest.id) return;

    dialogRef.current?.showModal();
  }, [latest]);

  function dismiss() {
    if (latest) rememberSeenAnnouncement(latest.id);
    dialogRef.current?.close();
  }

  if (!latest) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={dismiss}
      aria-labelledby="announcement-title"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.badge}>更新公告</span>
          <time className={styles.date}>{latest.date}</time>
        </div>
        <h2 id="announcement-title" className={styles.title}>
          {latest.title}
        </h2>
        <p className={styles.body}>{latest.content}</p>
        <Button
          className={styles.dismiss}
          onClick={dismiss}
          type="button"
        >
          知道了
        </Button>
      </div>
    </dialog>
  );
}
