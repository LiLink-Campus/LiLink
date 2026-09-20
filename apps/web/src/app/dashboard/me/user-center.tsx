"use client";
import { PwaInstallEntry } from "../../_components/PwaInstall";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthSession } from "../../auth-session";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { fetchApi, type AuthMePayload } from "../../../lib/api";
import type { VipStatus } from "../vip/vip-client";
import { UserCircleIcon, HeartIcon } from "../_components/icons";
import { DeleteAccount } from "./delete-account";
import styles from "./user-center.module.css";

export function UserCenter({ initialStatus, initialUser }: { initialStatus: VipStatus | null; initialUser: AuthMePayload }) {
  useDashboardSessionSeed(initialUser);
  const { user } = useAuthSession();
  const [status, setStatus] = useState(initialStatus);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try { const next = await fetchApi<VipStatus>("/me/vip"); if (alive) setStatus(next); }
      catch { if (alive) setStatus(null); }
    }
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { alive = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);
  const account = user ?? initialUser;
  const name = account.displayName || "未命名同学";
  const active = status?.active && (!status.expiresAt || Date.parse(status.expiresAt) > Date.now());
  return <div className={styles.page}>
    <header className={styles.heading}><h1>用户中心</h1><p className={styles.desktopOnly}>管理你的账号与权益。</p></header>
    <section className={styles.identity} aria-label="账号信息">
      <span className={styles.avatar} aria-hidden="true">{Array.from(name)[0]?.toUpperCase()}</span>
      <div><h2>{name}</h2><p>{account.email}</p><Link className={styles.desktopOnly} href="/dashboard/profile">编辑匹配资料 →</Link></div>
    </section>
    <section className={styles.vip} aria-labelledby="center-vip-title">
      <HeartIcon className={styles.decoration} />
      <div className={styles.vipHeading}><h2 id="center-vip-title">VIP 与激活码</h2><span>{!status ? "状态待刷新" : active ? "已开通" : status.expiresAt ? "已到期" : "未开通"}</span></div>
      <p className={styles.filters}>学校 · 身高 · 体重 · 颜值 · 锻炼频率</p>
      {active && status?.expiresAt && <p className={styles.expiry}>有效期至 {new Date(status.expiresAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>}
      <Link className={styles.vipLink} href="/dashboard/vip">查看权益与激活 <span aria-hidden="true">→</span></Link>
    </section>
    <section className={styles.benefitsSection} aria-labelledby="center-benefits"><h2 id="center-benefits" className={styles.sectionTitle}>我的权益</h2>
      <div className={styles.entryGroup}>
      <div className={styles.benefits}>
        <Link href="/dashboard/referrals"><UserCircleIcon /><div><strong>我的邀请</strong><span>邀请朋友加入</span></div></Link>
        <Link href="/dashboard/coupons"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6V4Z"/><path d="M14 5v3m0 3v2m0 3v3"/></svg><div><strong>我的优惠券</strong><span>查看可用优惠</span></div></Link>
      </div>
      <PwaInstallEntry />
      </div>
    </section>
    <section className={styles.securitySection} aria-labelledby="center-security"><h2 id="center-security" className={styles.sectionTitle}>账号安全</h2>
      <div className={styles.security}>
        <Link href="/forgot-password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg><span>修改密码</span><span aria-hidden="true">›</span></Link>
        <DeleteAccount className={styles.delete} />
      </div>
    </section>
  </div>;
}
