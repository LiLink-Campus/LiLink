"use client";
import { PwaInstallEntry } from "../../_components/PwaInstall";
import Link from "next/link";
import { IntentLink } from "../../../components/IntentLink";
import { useState } from "react";
import { useAuthSession } from "../../auth-session";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import type { AuthMePayload } from "../../../lib/api";
import { useVipStatus } from "../_lib/use-vip-status";
import type { VipStatus } from "@lilink/shared";
import { UserCircleIcon } from "../_components/icons";
import { FiltersIcon, PriorityIcon, VipCrown, VipOrbits } from "../vip/vip-art";
import { EducationCard } from "./education-card";
import { useEducationStatus } from "./use-education-status";
import { MemberIdentity } from "../_components/MemberIdentity";
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
  const education = useEducationStatus(account.id);
  const name = account.displayName || "未命名同学";
  const active = status?.active && (!status.expiresAt || Date.parse(status.expiresAt) > Date.now());
  return <div className={styles.page}>
    <header className={styles.heading}><h1>用户中心</h1><p className={styles.desktopOnly}>管理你的账号与权益。</p></header>
    <section className={`${styles.identity} ${active ? styles.identityActive : ""}`} aria-label="账号信息">
      <span className={styles.avatar} aria-hidden="true">{Array.from(name)[0]?.toUpperCase()}</span>
      <div><div className={styles.nameRow}><h2>{name}</h2><MemberIdentity label="用户身份" vipActive={Boolean(active)} educationVerified={education.status?.verified} /></div><p>{account.email}</p><IntentLink className={styles.desktopOnly} href="/dashboard/profile">编辑匹配资料 →</IntentLink></div>
    </section>
    <section className={`${styles.vip} ${active ? styles.vipActive : ""}`} aria-labelledby="center-vip-title">
      <VipOrbits className={styles.decoration} />
      <div className={styles.vipHeading}><h2 id="center-vip-title"><VipCrown />LiLink VIP</h2><span>{!status ? "状态待刷新" : active ? "已开通" : status.expiresAt ? "已到期" : "未开通"}</span></div>
      <div className={styles.vipFeatures}>
        <div><PriorityIcon /><div><h3>优先匹配</h3><p>匹配时最优先安排</p></div></div>
        <div><FiltersIcon /><div><h3>高级筛选</h3><p>更贴近你的期待</p></div></div>
      </div>
      {active && status?.expiresAt && <p className={styles.expiry}>有效期至 {new Date(status.expiresAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>}
      <IntentLink className={styles.vipLink} href="/dashboard/vip">查看权益与激活 <span aria-hidden="true">→</span></IntentLink>
    </section>
    <div className={styles.details}>
    <EducationCard key={account.id} status={education.status} error={education.error} onRetry={education.retry} onVerified={education.accept} />
    <section className={styles.benefitsSection} aria-labelledby="center-benefits">
      <h2 id="center-benefits" className={styles.sectionTitle}>我的权益</h2>
      <div className={styles.benefits}>
        <Link href="/dashboard/referrals" {...auxiliaryLink("/dashboard/referrals")}><UserCircleIcon /><strong>我的邀请</strong><span aria-hidden="true">↗</span></Link>
        <Link href="/dashboard/coupons" {...auxiliaryLink("/dashboard/coupons")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6V4Z"/><path d="M14 5v3m0 3v2m0 3v3"/></svg><strong>我的优惠券</strong><span aria-hidden="true">↗</span></Link>
      </div>
    </section>
    <PwaInstallEntry className={styles.installRow} />
    </div>
  </div>;
}
