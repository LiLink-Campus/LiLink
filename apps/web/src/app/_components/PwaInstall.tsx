"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getInstallState, INSTALL_READY_WAIT_MS, type InstallEvent } from "../../lib/pwa-install-state";
import styles from "./pwa-install.module.css";

const DISMISSED_KEY = "lilink-install-dismissed";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const InstallContext = createContext({ installed: true, dismissed: true, busy: false, ready: false, install: () => {}, dismiss: () => {} });
type DialogMode = "checking" | "ready" | "guide" | "cancelled";

function StepIcon({ share = false }: { share?: boolean }) {
  return <svg className={styles.stepIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{share ? <><path d="M8 8H5v13h14V8h-3M12 15V2m-4 4 4-4 4 4" /></> : <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 7v10m-5-5h10" /></>}</svg>;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [platform, setPlatform] = useState<"ios" | "embedded" | "other">("other");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<DialogMode>("guide");
  function clearWait() {
    if (waitTimer.current !== null) clearTimeout(waitTimer.current);
    waitTimer.current = null;
  }
  useEffect(() => {
    mounted.current = true;
    const state = getInstallState();
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const isInstalled = state.installed || media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setInstalled(isInstalled);
      if (isInstalled) { clearWait(); dialog.current?.close(); }
    };
    update();
    setReady(Boolean(state.event));
    setBusy(state.prompting);
    try { setDismissed(Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < WEEK); } catch { setDismissed(false); }
    const ua = navigator.userAgent;
    setPlatform(/MicroMessenger|QQ\//i.test(ua) ? "embedded" : /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : "other");
    const onReady = (event: Event) => {
      const candidate = event as InstallEvent;
      if (typeof candidate.prompt !== "function" || !candidate.userChoice) return;
      event.preventDefault();
      if (state.installed) return;
      state.event = candidate;
      setReady(true);
      clearWait();
      // Keep the next prompt inside a fresh user gesture; never consume it on a timer.
      setMode("ready");
    };
    const done = () => { state.event = null; state.installed = true; update(); };
    const sync = () => { update(); setReady(Boolean(state.event)); setBusy(state.prompting); };
    window.addEventListener("beforeinstallprompt", onReady);
    window.addEventListener("appinstalled", done);
    media.addEventListener("change", update);
    window.addEventListener("lilink:install-state", sync);
    return () => { mounted.current = false; clearWait(); window.removeEventListener("beforeinstallprompt", onReady); window.removeEventListener("appinstalled", done); media.removeEventListener("change", update); window.removeEventListener("lilink:install-state", sync); };
  }, []);
  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* Storage may be unavailable. */ }
  }
  async function install() {
    const state = getInstallState();
    if (state.prompting || state.installed) return;
    clearWait();
    const pending = state.event;
    if (pending) {
      state.event = null;
      state.prompting = true;
      setReady(false);
      setBusy(true);
      dialog.current?.close();
      try {
        // Call synchronously in the click handler, before any await or network request.
        await pending.prompt();
        const choice = await pending.userChoice;
        if (choice.outcome === "accepted" || state.installed) {
          state.installed = true;
          state.event = null;
          if (mounted.current) setInstalled(true);
        } else if (mounted.current) {
          setMode(state.event ? "ready" : "cancelled");
          dialog.current?.showModal();
        }
        return;
      } catch {
        if (mounted.current && !state.installed) {
          setMode(state.event ? "ready" : "guide");
          dialog.current?.showModal();
        }
        return;
      } finally {
        state.prompting = false;
        window.dispatchEvent(new Event("lilink:install-state"));
        if (mounted.current) { setBusy(false); setReady(Boolean(state.event)); }
      }
    }
    if (platform === "other") {
      setMode("checking");
      waitTimer.current = setTimeout(() => {
        waitTimer.current = null;
        setMode(getInstallState().event ? "ready" : "guide");
      }, INSTALL_READY_WAIT_MS);
    } else setMode("guide");
    dialog.current?.showModal();
  }
  return <InstallContext.Provider value={{ installed, dismissed, busy, ready, install: () => void install(), dismiss }}>
    {children}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="install-title" onClose={clearWait} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.sheet}>
        <span className={styles.handle} aria-hidden="true" />
        <button className={styles.close} aria-label="关闭安装引导" onClick={() => dialog.current?.close()}>×</button>
        <h2 id="install-title">{mode === "checking" ? "正在准备安装" : mode === "ready" ? "安装 LiLink" : mode === "cancelled" ? "已取消安装" : platform === "ios" ? "添加到主屏幕" : "把 LiLink 放到桌面"}</h2>
        {mode === "checking" ? <p role="status">正在等待浏览器，准备好后即可安装。</p> : mode === "ready" ? <p role="status">已准备好，点击下方按钮完成安装。</p> : mode === "cancelled" ? <p>你取消了这次安装，可以重新尝试。</p> : platform === "ios" ? <>
          <p>用 Safari 打开 LiLink，跟着两步操作</p>
          <ol><li><span>1</span><StepIcon share />点击浏览器的分享按钮</li><li><span>2</span><StepIcon />选择「添加到主屏幕」</li></ol>
          <div className={styles.example}>＋ 添加到主屏幕 <span aria-hidden="true">›</span></div>
        </> : platform === "embedded" ? <>
          <p>请先在系统浏览器中打开 LiLink</p>
          <ol><li><span>1</span>点击右上角菜单，选择在浏览器中打开</li><li><span>2</span>在浏览器菜单中选择安装应用或添加到主屏幕</li></ol>
        </> : <>
          <p>自动添加失败，以下是手动添加步骤</p>
          <ol><li><span>1</span><svg className={styles.stepIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>打开浏览器菜单</li><li><span>2</span><StepIcon />选择「安装应用」或「添加到主屏幕」</li></ol>
        </>}
        {mode === "ready" || mode === "cancelled" ? <button className={styles.primary} onClick={() => void install()} disabled={busy}>{mode === "ready" ? "立即安装" : "重新尝试安装"}</button> : mode === "checking" ? <button className={styles.primary} onClick={() => { clearWait(); setMode("guide"); }}>查看手动添加方法</button> : <button className={styles.primary} onClick={() => dialog.current?.close()}>知道了</button>}
      </div>
    </dialog>
  </InstallContext.Provider>;
}

export function PwaInstallEntry() {
  const { installed, install, busy, ready } = useContext(InstallContext);
  if (installed) return null;
  return <button className={styles.entry} onClick={install} disabled={busy} aria-busy={busy}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="2" width="12" height="20" rx="2"/><path d="M9 18h2m9-11v8m-4-4h8"/></svg>
    <span><strong>{busy ? "正在打开安装窗口…" : "添加到桌面"}</strong><small>{ready ? "已准备好，点击即可安装" : "下次打开 LiLink，更方便"}</small></span><span aria-hidden="true">›</span>
  </button>;
}

export function PwaInstallCard() {
  const { installed, dismissed, install, dismiss, busy } = useContext(InstallContext);
  if (installed || dismissed) return null;
  return <aside className={styles.card} aria-label="添加 LiLink 到桌面">
    <button className={styles.close} aria-label="暂时关闭安装提示" onClick={dismiss}>×</button>
    <div className={styles.cardContent}><span className={styles.appIcon} aria-hidden="true">L</span><div><h3>把 LiLink 放到桌面</h3><p>下次直接打开，报名匹配、查看结果更方便。</p></div></div>
    <div className={styles.actions}><button className={styles.primary} onClick={install} disabled={busy}>{busy ? "正在打开安装窗口…" : "添加到桌面"}</button><button className={styles.later} onClick={dismiss}>暂时不用</button></div>
  </aside>;
}
