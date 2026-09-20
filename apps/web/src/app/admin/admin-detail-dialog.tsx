"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AdminIcon } from "./admin-icon";
import styles from "./admin-detail-dialog.module.css";

export function AdminDetailDialog({
  open,
  onClose,
  children,
  title = "用户详情",
  headerLabel = "账号资料",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  headerLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.content}>
        <header className={styles.header}>
          <span>{headerLabel}</span>
          <button type="button" onClick={onClose} aria-label={`关闭${title}`} autoFocus>
            <AdminIcon name="close" width="18" height="18" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
