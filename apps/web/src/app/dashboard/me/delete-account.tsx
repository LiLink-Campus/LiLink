"use client";
import { useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAuthSession } from "../../auth-session";
import styles from "../_components/AppShell.module.css";
import modalStyles from "../_components/HomeOverview.module.css";
export function DeleteAccount({ className }: { className?: string }) {
  const { setUser } = useAuthSession();
  const deletionDialog = useRef<HTMLDialogElement>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await fetchApi("/me/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }) });
      setUser(null);
      window.location.replace("/");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "注销失败，请稍后重试。");
      setDeleting(false);
    }
  }

  return <><button type="button" className={className} onClick={() => { setDeletePassword(""); setDeleteConfirmation(""); setDeleteError(null); deletionDialog.current?.showModal(); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg><span>注销账号</span><span aria-hidden="true">›</span></button>      <dialog ref={deletionDialog} className={modalStyles.dialog} aria-labelledby="delete-account-title" onCancel={event => { if (deleting) event.preventDefault(); }}>
        <button className={modalStyles.close} aria-label="关闭" disabled={deleting} onClick={() => deletionDialog.current?.close()}>×</button>
        <h2 id="delete-account-title">注销账号</h2>
        <p className={styles.deletionWarning}>注销后，这个账号将无法再登录或参加匹配。</p>
        <p>原邮箱会释放，可重新注册。</p>
        <form onSubmit={deleteAccount} className={styles.deletionForm}>
          <label>当前登录密码<input type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={deletePassword} onChange={event => setDeletePassword(event.target.value)} disabled={deleting} /></label>
          <label>输入“注销账号”确认<input required value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} disabled={deleting} autoComplete="off" /></label>
          {deleteError && <p role="alert" className={styles.deletionWarning}>{deleteError}</p>}
          <button type="submit" className={modalStyles.primary} disabled={deleting || deleteConfirmation !== "注销账号"}>{deleting ? "正在注销…" : "确认注销账号"}</button>
          <button type="button" className={modalStyles.secondary} disabled={deleting} onClick={() => deletionDialog.current?.close()}>暂不注销，返回</button>
        </form>
      </dialog></>;
}
