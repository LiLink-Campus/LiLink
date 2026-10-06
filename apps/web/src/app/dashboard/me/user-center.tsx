"use client";
import { PwaInstallEntry } from "../../_components/PwaInstall";
import Link from "next/link";
import { useState } from "react";
import { useAuthSession } from "../../auth-session";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import type { AuthMePayload } from "../../../lib/api";
import { useVipStatus } from "../_lib/use-vip-status";
import type { VipStatus } from "@lilink/shared";
import { UserCircleIcon } from "../_components/icons";
import { FiltersIcon, PriorityIcon, VipCrown, VipOrbits } from "../vip/vip-art";
import { DeleteAccount } from "./delete-account";
import styles from "./user-center.module.css";

export function UserCenter({ initialStatus, initialUser, vipBootstrap = initialUser }: { initialStatus: VipStatus | null; initialUser: AuthMePayload; vipBootstrap?: object }) {
  useDashboardSessionSeed(initialUser);
  const { user } = useAuthSession();
  const { vip, error } = useVipStatus(initialUser.id, initialStatus, vipBootstrap);
  const status = error ? null : vip;
  const [intentHref, setIntentHref] = useState<string | null>(null);
  const auxiliaryLink = (href: string) => ({
    prefetch: intentHref === href ? null : false,
    onMouseEnter: () => setIntentHref(href),
    onFocus: () => setIntentHref(href),
    onTouchStart: () => setIntentHref(href),
  });
  const account = user ?? initialUser;
  const name = account.displayName || "未命名同学";
  const active = status?.active && (!status.expiresAt || Date.parse(status.expiresAt) > Date.now());
  return <div className={styles.page}>
    <header className={styles.heading}><h1>用户中心</h1><p className={styles.desktopOnly}>管理你的账号与权益。</p></header>
    <section className={`${styles.identity} ${active ? styles.identityActive : ""}`} aria-label="账号信息">
      <span className={styles.avatar} aria-hidden="true">{Array.from(name)[0]?.toUpperCase()}</span>
      <div><div className={styles.nameRow}><h2>{name}</h2>{active && <span className={styles.vipBadge} aria-label="VIP 会员"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="m3 7 5 4 4-7 4 7 5-4-2 11H5L3 7Z" /><path d="M6 21h12" /></svg>VIP<span className={styles.sparkle} aria-hidden="true">✦</span></span>}</div><p>{account.email}</p><Link className={styles.desktopOnly} href="/dashboard/profile">编辑匹配资料 →</Link></div>
    </section>
    <section className={`${styles.vip} ${active ? styles.vipActive : ""}`} aria-labelledby="center-vip-title">
      <VipOrbits className={styles.decoration} />
      <div className={styles.vipHeading}><h2 id="center-vip-title"><VipCrown />LiLink VIP</h2><span>{!status ? "状态待刷新" : active ? "已开通" : status.expiresAt ? "已到期" : "未开通"}</span></div>
      <div className={styles.vipFeatures}>
        <div><PriorityIcon /><div><h3>优先匹配</h3><p>匹配时优先安排</p></div></div>
        <div><FiltersIcon /><div><h3>高级筛选</h3><p>更贴近你的期待</p></div></div>
      </div>
      {active && status?.expiresAt && <p className={styles.expiry}>有效期至 {new Date(status.expiresAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>}
      <Link className={styles.vipLink} href="/dashboard/vip">查看权益与激活 <span aria-hidden="true">→</span></Link>
    </section>
    <section className={styles.benefitsSection} aria-labelledby="center-benefits"><h2 id="center-benefits" className={styles.sectionTitle}>我的权益</h2>
      <div className={styles.entryGroup}>
      <div className={styles.benefits}>
        <Link href="/dashboard/referrals" {...auxiliaryLink("/dashboard/referrals")}><UserCircleIcon /><div><strong>我的邀请</strong><span>邀请朋友加入</span></div></Link>
        <Link href="/dashboard/coupons" {...auxiliaryLink("/dashboard/coupons")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6V4Z"/><path d="M14 5v3m0 3v2m0 3v3"/></svg><div><strong>我的优惠券</strong><span>查看可用优惠</span></div></Link>
      </div>
      <PwaInstallEntry />
      </div>
    </section>
    <section className={styles.securitySection} aria-labelledby="center-security"><h2 id="center-security" className={styles.sectionTitle}>账号安全</h2>
      <div className={styles.security}>
        <Link href="/forgot-password" {...auxiliaryLink("/forgot-password")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg><span>修改密码</span><span aria-hidden="true">›</span></Link>
        <DeleteAccount className={styles.delete} />
      </div>
    </section>
  </div>;
}
