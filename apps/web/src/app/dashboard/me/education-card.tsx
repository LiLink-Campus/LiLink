"use client";
import { useEffect, useRef, useState } from "react";
import type { EducationStatus } from "@lilink/shared";
import { EducationForm } from "./education-form";
import styles from "./education-card.module.css";

export function EducationCard({ status, error, onRetry, onVerified }: {
  status: EducationStatus | null; error: string; onRetry: () => void;
  onVerified: (status: EducationStatus) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"invite" | "email" | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  function close() { if (!busy) dialog.current?.close(); }
  return <section className={styles.card} aria-label="教育认证">
    <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m2 11 14-6 14 6-14 6-14-6Zm5 3v10c5 4 13 4 18 0V14m5-3v12" /></svg></span>
    <div className={styles.summary}><h2>教育认证</h2>
      {!status ? <p role={error ? "alert" : "status"}>{error || "正在读取认证状态…"}</p>
        : status.verified ? <p>已通过教育认证{status.schoolName ? ` · ${status.schoolName}` : ""}，享有教育用户匹配优先权。</p>
        : <><p>认证教育身份，享有优先匹配</p><small>支持教育邮箱或邀请码认证</small></>}
    </div>
    {!status && error ? <button className={styles.entry} onClick={onRetry}>重试认证状态</button>
      : status && !status.verified && <button ref={trigger} className={styles.entry} aria-haspopup="dialog" onClick={() => { setMode(null); dialog.current?.showModal(); setOpen(true); }}>去认证</button>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="education-dialog-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.sheet}>
        <button className={styles.close} aria-label="关闭教育认证" disabled={busy} onClick={close}>×</button>
        <h2 id="education-dialog-title">{mode === "invite" ? "使用邀请码认证" : mode === "email" ? "认证教育邮箱" : "选择认证方式"}</h2>
        <p>认证后成为教育用户，原登录邮箱保持不变。</p>
        {open && (mode ? <><button className={styles.back} disabled={busy} onClick={() => setMode(null)}>← 更换认证方式</button><EducationForm key={mode} mode={mode} onBusy={setBusy} onVerified={value => { onVerified(value); dialog.current?.close(); }} /></>
          : <div className={styles.choices}><button onClick={() => setMode("invite")}><strong>使用邀请码认证</strong><small>填写邀请码并确认学校</small><span aria-hidden="true">›</span></button><button onClick={() => setMode("email")}><strong>认证教育邮箱</strong><small>通过合作高校邮箱验证身份</small><span aria-hidden="true">›</span></button></div>)}
      </div>
    </dialog>
  </section>;
}
