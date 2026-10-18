"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { Button, ButtonLink } from "@/components/ui";
import styles from "./school-email-notice.module.css";

export function SchoolEmailNotice({ open, onClose, personalHref, returnFocusRef }: {
  open: boolean;
  onClose: () => void;
  personalHref: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const returnFocusTarget = returnFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      returnFocusTarget?.focus();
    };
  }, [open, returnFocusRef]);

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.content}>
      <h2 id={headingId}>请使用普通邮箱注册</h2>
      <p id={descriptionId}>该邮箱后缀不在合作学校白名单内。请改用普通邮箱注册。</p>
      <div className={styles.actions}>
        <ButtonLink prefetch={false} href={personalHref}>改用普通邮箱注册</ButtonLink>
        <Button type="button" variant="secondary" onClick={onClose}>返回修改邮箱</Button>
      </div>
    </div>
  </dialog>;
}
