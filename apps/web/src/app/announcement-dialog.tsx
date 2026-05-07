"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { announcements } from "./announcements";
import { useLocale } from "./locale-context";

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
  const pathname = usePathname();
  const { locale } = useLocale();
  const displayLocale = pathname.startsWith("/admin") ? "zh-CN" : locale;
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
      className="announcement-dialog"
      onClose={dismiss}
      aria-labelledby="announcement-title"
    >
      <div className="announcement-dialog-inner">
        <div className="announcement-dialog-header">
          <span className="announcement-badge">
            {displayLocale === "zh-CN" ? "更新公告" : "Update"}
          </span>
          <time className="announcement-date">{latest.date}</time>
        </div>
        <h2 id="announcement-title" className="announcement-title">
          {latest.title[displayLocale]}
        </h2>
        <p className="announcement-body">{latest.content[displayLocale]}</p>
        <button
          className="button-primary announcement-dismiss"
          onClick={dismiss}
          type="button"
        >
          {displayLocale === "zh-CN" ? "知道了" : "Got it"}
        </button>
      </div>
    </dialog>
  );
}
