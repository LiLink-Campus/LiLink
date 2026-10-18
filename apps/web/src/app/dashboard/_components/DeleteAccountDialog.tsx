"use client";
import { useEffect, useRef, useState } from "react";
import { isApiRequestError, type AuthMePayload } from "../../../lib/api";
import { useAuthSession } from "../../auth-session";
import { isAccountActionCancelled, useAccountActionRequest } from "../_lib/use-account-action-request";
import styles from "./AppShell.module.css";
import modalStyles from "./HomeOverview.module.css";
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, setUser } = useAuthSession();
  const deletionDialog = useRef<HTMLDialogElement>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checkingResult, setCheckingResult] = useState(false);
  const { request, isMounted } = useAccountActionRequest();
  function finishExit() {
    setUser(null);
    window.location.replace("/");
  }
  async function confirmResult() {
    setCheckingResult(true);
    try {
      const currentUser = await request<AuthMePayload>("/auth/me");
      if (!isMounted()) return;
      if (user && currentUser.id !== user.id) {
        setUser(currentUser);
        onClose();
        return;
      }
      setUncertain(false);
      setDeleteError("当前账号仍可使用。确认要注销后，可重新提交；不会自动重复注销。");
    } catch (error) {
      if (!isMounted() || isAccountActionCancelled(error)) return;
      if (isApiRequestError(error) && error.status === 401) finishExit();
      else setDeleteError("注销结果待确认，暂时无法读取账号状态。请重新确认账号状态后再提交，也可以先返回。");
    } finally { if (isMounted()) setCheckingResult(false); }
  }
  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleting || uncertain) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await request("/me/account", { method: "DELETE", body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }) });
      if (isMounted()) finishExit();
    } catch (error) {
      if (!isMounted() || isAccountActionCancelled(error)) return;
      if (isApiRequestError(error) && error.status < 500) setDeleteError(error.message);
      else {
        setUncertain(true); setDeleting(false);
        setDeleteError("注销结果待确认，正在读取账号状态，请勿重复提交。");
        await confirmResult();
      }
    } finally { if (isMounted()) setDeleting(false); }
  }

  useEffect(() => { deletionDialog.current?.showModal(); }, []);

  return <dialog ref={deletionDialog} className={modalStyles.dialog} aria-labelledby="delete-account-title" onClose={onClose} onCancel={event => { if (deleting) event.preventDefault(); }}>
        <button className={modalStyles.close} aria-label="关闭" disabled={deleting} onClick={() => deletionDialog.current?.close()}>×</button>
        <h2 id="delete-account-title">注销账号</h2>
        <p className={styles.deletionWarning}>注销后，这个账号将无法再登录或参加匹配。</p>
        <p>原邮箱会释放，可重新注册。</p>
        <form onSubmit={deleteAccount} className={styles.deletionForm}>
          <label>当前登录密码<input type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={deletePassword} onChange={event => setDeletePassword(event.target.value)} disabled={deleting || uncertain} /></label>
          <label>输入“注销账号”确认<input required value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} disabled={deleting || uncertain} autoComplete="off" /></label>
          {deleteError && <p role="alert" className={styles.deletionWarning}>{deleteError}</p>}
          {uncertain && <button type="button" className={modalStyles.secondary} disabled={checkingResult} onClick={() => void confirmResult()}>{checkingResult ? "正在确认账号状态…" : "重新确认账号状态"}</button>}
          <button type="submit" className={modalStyles.primary} disabled={deleting || uncertain || deleteConfirmation !== "注销账号"}>{deleting ? "正在注销…" : "确认注销账号"}</button>
          <button type="button" className={modalStyles.secondary} disabled={deleting} onClick={() => deletionDialog.current?.close()}>暂不注销，返回</button>
        </form>
      </dialog>;
}
