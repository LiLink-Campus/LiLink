"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "../match/history/match-history.module.css";

export function HistoryDetails({ modal, title, children }: { modal: boolean; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!modal) return;
    const desktop = window.matchMedia("(min-width: 880px)");
    const closeOnMobile = () => { if (!desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnMobile);
    return () => desktop.removeEventListener("change", closeOnMobile);
  }, [modal]);
  if (!modal) return <div className={styles.detailContent}>{children}</div>;
  return <>
    <button ref={trigger} type="button" className={styles.detailTrigger} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>查看详情 <span aria-hidden="true">→</span></button>
    <dialog ref={dialog} className={styles.historyDialog} aria-labelledby={titleId} onClose={() => trigger.current?.focus({ preventScroll: true })} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.dialogInner}>
        <header className={styles.dialogHeader}><div><p>过往匹配</p><h2 id={titleId}>{title}</h2></div><button type="button" aria-label="关闭匹配详情" onClick={() => dialog.current?.close()}>×</button></header>
        <div className={styles.detailContent}>{children}</div>
      </div>
    </dialog>
  </>;
}
