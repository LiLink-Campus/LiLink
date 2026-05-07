"use client";

import { useEffect, useRef } from "react";
import { announcements } from "./announcements";

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
      className="announcement-dialog"
      onClose={dismiss}
      aria-labelledby="announcement-title"
    >
      <div className="announcement-dialog-inner">
        <div className="announcement-dialog-header">
          <span className="announcement-badge">更新公告</span>
          <time className="announcement-date">{latest.date}</time>
        </div>
        <h2 id="announcement-title" className="announcement-title">
          {latest.title}
        </h2>
        <p className="announcement-body">{latest.content}</p>
        <button
          className="button-primary announcement-dismiss"
          onClick={dismiss}
          type="button"
        >
          知道了
        </button>
      </div>
    </dialog>
  );
}
