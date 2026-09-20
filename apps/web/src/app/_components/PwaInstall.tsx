"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./pwa-install.module.css";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISSED_KEY = "lilink-install-dismissed";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const InstallContext = createContext({ installed: true, dismissed: true, install: () => {}, dismiss: () => {} });

function StepIcon({ share = false }: { share?: boolean }) {
  return <svg className={styles.stepIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{share ? <><path d="M8 8H5v13h14V8h-3M12 15V2m-4 4 4-4 4 4" /></> : <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 7v10m-5-5h10" /></>}</svg>;
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const prompt = useRef<InstallEvent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [platform, setPlatform] = useState<"ios" | "embedded" | "other">("other");
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    update();
    try { setDismissed(Date.now() - Number(localStorage.getItem(DISMISSED_KEY) || 0) < WEEK); } catch { setDismissed(false); }
    const ua = navigator.userAgent;
    setPlatform(/MicroMessenger|QQ\//i.test(ua) ? "embedded" : /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : "other");
    const ready = (event: Event) => { event.preventDefault(); prompt.current = event as InstallEvent; };
    const done = () => { prompt.current = null; setInstalled(true); dialog.current?.close(); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    media.addEventListener("change", update);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); media.removeEventListener("change", update); };
  }, []);
  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* Storage may be unavailable. */ }
  }
  async function install() {
    const pending = prompt.current;
    if (pending) {
      prompt.current = null;
      try {
        await pending.prompt();
        const choice = await pending.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        else dismiss();
        return;
      } catch { /* Fall back to browser instructions. */ }
    }
    dialog.current?.showModal();
  }
  return <InstallContext.Provider value={{ installed, dismissed, install: () => void install(), dismiss }}>
    {children}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="install-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.sheet}>
        <span className={styles.handle} aria-hidden="true" />
        <button className={styles.close} aria-label="关闭安装引导" onClick={() => dialog.current?.close()}>×</button>
        <h2 id="install-title">{platform === "ios" ? "添加到主屏幕" : "把 LiLink 放到桌面"}</h2>
        {platform === "ios" ? <>
          <p>用 Safari 打开 LiLink，跟着两步操作</p>
          <ol><li><span>1</span><StepIcon share />点击浏览器的分享按钮</li><li><span>2</span><StepIcon />选择「添加到主屏幕」</li></ol>
          <div className={styles.example}>＋ 添加到主屏幕 <span aria-hidden="true">›</span></div>
        </> : platform === "embedded" ? <>
          <p>请先在系统浏览器中打开 LiLink</p>
          <ol><li><span>1</span>点击右上角菜单，选择在浏览器中打开</li><li><span>2</span>在浏览器菜单中选择安装应用或添加到主屏幕</li></ol>
        </> : <>
          <p>在浏览器菜单中查找安装入口</p>
          <ol><li><span>1</span><svg className={styles.stepIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>打开浏览器菜单</li><li><span>2</span><StepIcon />选择「安装应用」或「添加到主屏幕」</li></ol>
        </>}
        <button className={styles.primary} onClick={() => dialog.current?.close()}>知道了</button>
      </div>
    </dialog>
  </InstallContext.Provider>;
}

export function PwaInstallEntry() {
  const { installed, install } = useContext(InstallContext);
  if (installed) return null;
  return <button className={styles.entry} onClick={install}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="4" y="2" width="12" height="20" rx="2"/><path d="M9 18h2m9-11v8m-4-4h8"/></svg>
    <span><strong>添加到桌面</strong><small>下次打开 LiLink，更方便</small></span><span aria-hidden="true">›</span>
  </button>;
}

export function PwaInstallCard() {
  const { installed, dismissed, install, dismiss } = useContext(InstallContext);
  if (installed || dismissed) return null;
  return <aside className={styles.card} aria-label="添加 LiLink 到桌面">
    <button className={styles.close} aria-label="暂时关闭安装提示" onClick={dismiss}>×</button>
    <div className={styles.cardContent}><span className={styles.appIcon} aria-hidden="true">L</span><div><h3>把 LiLink 放到桌面</h3><p>下次直接打开，报名匹配、查看结果更方便。</p></div></div>
    <div className={styles.actions}><button className={styles.primary} onClick={install}>添加到桌面</button><button className={styles.later} onClick={dismiss}>暂时不用</button></div>
  </aside>;
}
