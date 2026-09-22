"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { fetchApi, ApiRequestError, type AuthMePayload } from "../../lib/api";
import styles from "./registration.module.css";

export function Registration() {
  const anchor = useRef<HTMLDivElement>(null);
  const [stickyTop, setStickyTop] = useState<number | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const header = document.querySelector("header");
    const update = () => {
      const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
      const rect = anchor.current?.getBoundingClientRect();
      setStickyTop(media.matches && rect && rect.top < top ? top : null);
    };
    const observer = new ResizeObserver(update);
    if (header) observer.observe(header);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  const dialog = useRef<HTMLDialogElement>(null);
  const [user, setUser] = useState<AuthMePayload | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  async function open() {
    if (pending.current) return;
    pending.current = true; setChecking(true); setError(""); setDone(false);
    try { setUser(await fetchApi<AuthMePayload>("/auth/me")); }
    catch (e) { setUser(null); if (!(e instanceof ApiRequestError && e.status === 401)) setError("暂时无法获取账号信息，请关闭后重试。"); }
    finally { pending.current = false; setChecking(false); dialog.current?.showModal(); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    pending.current = true; setSaving(true); setError("");
    try {
      await fetchApi("/me/match-leads", { method: "POST", body: JSON.stringify({ realName: data.get("realName"), school: data.get("school"), major: data.get("major"), contact: `+86${String(data.get("phone") ?? "").replace(/[\s()-]/g, "")}`, consent: data.get("consent") === "on" }) });
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "提交失败，请重试。"); }
    finally { pending.current = false; setSaving(false); }
  }
  const entry = <div className={styles.entry}><div><strong>登记人工匹配意向</strong><p>留下基本信息，专属运营将与你联系。</p></div><button onClick={() => void open()} disabled={checking}>{checking ? "加载中…" : "填写登记表"}</button></div>;
  return <>
    <div ref={anchor} style={{ visibility: stickyTop === null ? "visible" : "hidden" }}>{entry}</div>
    {stickyTop !== null && createPortal(<div className={styles.sticky} style={{ top: stickyTop }}>{entry}</div>, document.body)}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="registration-title" onCancel={event => { if (saving) event.preventDefault(); }}>
      <header><h2 id="registration-title">人工服务登记</h2><button aria-label="关闭登记表" disabled={saving} onClick={() => dialog.current?.close()}>×</button></header>
      {!user && error ? <p role="alert">{error}</p> : !user ? <div><p>请先登录，登记信息会关联你的 LiLink 账号。</p><Link href="/login?next=%2Fone-to-one">去登录</Link></div> : done ? <div role="status"><h3>登记成功</h3><p>你的信息已提交，我们会安排运营联系你，并再次核实身份。请注意确认联系人的身份，避免无关人员冒用。</p><button onClick={() => dialog.current?.close()}>知道了</button></div> : <form onSubmit={event => void submit(event)}>
        <p>登记将关联当前账号。运营联系你时会再次核实身份，请确认对方身份，避免无关人员冒用。</p>
        <fieldset disabled={saving}>
          {([['realName','真实姓名',80,'请填写真实姓名'],['school','学校',120,'请填写学校全称'],['major','专业',120,'请填写所学专业']] as const).map(([name,label,maxLength,placeholder]) => <label key={name}>{label}<input name={name} required maxLength={maxLength} placeholder={placeholder} autoComplete={name === 'realName' ? 'name' : 'off'} /></label>)}
          <label htmlFor="lead-phone">手机号<input id="lead-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="1[3-9][0-9]{9}" maxLength={11} title="请输入11位中国大陆手机号" placeholder="请输入11位手机号" /></label>
          <label className={styles.consent}><input type="checkbox" name="consent" required />我同意将以上信息用于人工匹配登记、身份核实和运营联系。</label>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "提交中…" : "提交登记"}</button>
      </form>}
    </dialog>
  </>;
}
