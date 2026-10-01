"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BrandIcon, BrandMark } from "./brand-mark";
import { SocialFloater } from "./_components/SocialFloater";
import { SiteNav } from "./site-nav";
import { UpdatesNewBadge } from "./updates-new-badge";
import { useAuthSession } from "./auth-session";
import { fetchApi } from "../lib/api";
import styles from "./public-chrome.module.css";
import authPage from "./auth-page.module.css";

/**
 * Renders the public marketing chrome (site-header + footer) only on
 * marketing/auth pages. Dashboard and admin sections own their own
 * shells and should not see this wrapper.
 */
export function PublicChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser } = useAuthSession();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const isAppShell = pathname.startsWith("/dashboard") || pathname.startsWith("/admin");

  if (isAppShell) {
    return <>{children}</>;
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await fetchApi("/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/");
      router.refresh();
    } catch {
      setLogoutError("退出失败，请稍后重试。");
    } finally {
      setLoggingOut(false);
    }
  }

  const isAuthPage = pathname === "/login" || pathname.startsWith("/register") || pathname === "/forgot-password";
  if (isAuthPage) {
    return <div className={styles.siteFrame}>
      <header className={styles.siteHeader}><BrandMark href="/" /><SiteNav /></header>
      <div className={authPage.layout}>
        <aside className={authPage.visual} aria-label="校园里的，认真相遇">
          <div className={authPage.visualCopy}>
            <p>让相遇这件事<br />值得被认真对待。</p>
            <span>校园里的，认真相遇。</span>
          </div>
        </aside>
        <div className={authPage.content}>{children}</div>
      </div>
    </div>;
  }

  return (
    <div className={styles.siteFrame}>
      <header className={styles.siteHeader}>
        <BrandMark href="/" />
        <SiteNav />
      </header>
      {children}
      {pathname === "/" && <SocialFloater />}
      {!pathname.startsWith("/register") && <footer className={styles.siteFooter}>
        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrand}>
              <Link href="/" className={styles.footerLogo}>
                <span className={styles.footerIcon} aria-hidden="true">
                  <BrandIcon />
                </span>
                <span>LiLink</span>
              </Link>
              <p className={styles.footerMotto}>
                校园里的，
                <br />
                认真相遇。
              </p>
            </div>

            <nav className={styles.footerSitemap} aria-label="页脚导航">
              <div className={styles.footerColumn}>
                <h2>探索</h2>
                <Link href="/register">立即加入</Link>
                <Link href="/schools">支持的学校</Link>
                <Link href="/dashboard">我的匹配</Link>
              </div>
              <div className={styles.footerColumn}>
                <h2>支持</h2>
                <a href={pathname === "/" ? "#faq" : "/#faq"}>常见问题</a>
                <Link href="/terms">用户协议</Link>
                <Link href="/privacy">隐私政策</Link>
              </div>
              <div className={styles.footerColumn}>
                <h2>关于</h2>
                <Link href="/about">关于我们</Link>
                <Link href="/updates">
                  更新日志
                  <UpdatesNewBadge />
                </Link>
                {user ? (
                  <button disabled={loggingOut} onClick={() => void handleLogout()}>
                    {loggingOut ? "正在退出…" : "退出登录"}
                  </button>
                ) : null}
                {logoutError ? (
                  <p role="alert" className={styles.footerError}>
                    {logoutError}
                  </p>
                ) : null}
              </div>
            </nav>

            <section className={styles.footerFollow} aria-labelledby="footer-follow-title">
              <h2 id="footer-follow-title">关注我们</h2>
              <p>了解 LiLink 的最新消息</p>
              <div className={styles.footerQrs}>
                {["微信", "小红书"].map((channel) => (
                  <figure className={styles.footerQr} key={channel}>
                    <div
                      className={styles.qrPlaceholder}
                      role="img"
                      aria-label={`${channel}二维码待补充`}
                    >
                      <span aria-hidden="true">＋</span>
                      <small>二维码待补充</small>
                    </div>
                    <figcaption>{channel}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </div>
          <div className={styles.footerBottom}>
            <p>© {new Date().getFullYear()} LiLink</p>
            <p>好的关系，源于尊重与真诚</p>
          </div>
        </div>
      </footer>}
    </div>
  );
}
