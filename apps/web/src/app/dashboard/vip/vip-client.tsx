"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { SocialQr, socialChannels } from "../../_components/SocialQr";
import styles from "./vip.module.css";

export type VipStatus = {
  active: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  durationDays: number;
  priceYuan: string;
  advancedFiltersAvailable: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function VipClient({ initialStatus }: { initialStatus: VipStatus | null }) {
  const contactDialog = useRef<HTMLDialogElement>(null);
  const contactCloseButton = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState(initialStatus);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function openContactDialog() {
    contactDialog.current?.showModal();
    contactCloseButton.current?.focus({ preventScroll: true });
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try { setStatus(await fetchApi<VipStatus>("/me/vip")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "读取失败，请重试。"); }
    finally { setBusy(false); }
  }

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await fetchApi<VipStatus>("/me/vip/activate", { method: "POST", body: JSON.stringify({ code }) });
      setStatus(result);
      setCode("");
      setSuccess(result.active);
      if (!result.active) setError("此码此前已兑换，会员已到期。请使用新的激活码。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "激活失败，请重试。"); }
    finally { setBusy(false); }
  }

  const days = status?.durationDays ?? 30;
  const price = Number(status?.priceYuan ?? 29.9).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const benefits = [
    { label: "每周匹配", free: true },
    { label: "年龄与性别偏好", free: true },
    { label: "吸烟情况筛选", free: true },
    { label: "饮酒频率筛选", free: true },
    { label: "锻炼频率筛选", free: false },
    { label: "学校筛选", free: false },
    { label: "身高筛选", free: false },
    { label: "体重筛选", free: false },
    { label: "颜值筛选", free: false },
  ];
  return <section className={styles.page} aria-labelledby="vip-title">
    <Link className={styles.back} href="/dashboard/me">← 返回用户中心</Link>
    <header className={styles.intro}><span className={styles.eyebrow}>LiLink VIP</span><h1 id="vip-title">让相遇，更合心意</h1><p>更具体地表达你的期待。</p></header>
    <section className={styles.membership} aria-label="会员方案与状态">
      <svg className={styles.decoration} viewBox="0 0 200 180" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d="M15 165C160 110 190 30 145 25C120 22 108 49 105 56C50-20 0 40 67 98S180 150 200 120" /></svg>
      <div className={styles.cardHeading}><h2>VIP 高级筛选</h2><span className={styles.badge}>{!status ? "状态暂不可用" : status.active ? "VIP 已开通" : status.expiresAt ? "VIP 已到期" : "尚未开通 VIP"}</span></div>
      <p className={styles.price}><span>¥</span>{price}<small>/ {days} 天</small></p>
      <p>每张卡密增加 30 天，有效期可顺延</p>
      {status?.expiresAt && <p className={styles.expiry}>到期时间：{formatDate(status.expiresAt)}（北京时间）</p>}
      {status?.active && <Link className={styles.manage} href="/dashboard/profile#profile-attention-hard_partner_looks">前往设置筛选 →</Link>}
    </section>
      {status && <div className={styles.purchase}>
        <a className={styles.purchaseButton} href="https://catfk.com/item/ry2djy" target="_blank" rel="noopener noreferrer">购买 VIP 卡密 <span aria-hidden="true">↗</span></a>
        <p>云猫发放卡密 · 购买后返回本页激活</p>
        <a className={styles.activationLink} href="#vip-activation">已有卡密？去激活 ↓</a>
      </div>}
    {success && <p role="status" className={styles.success}>激活成功，会员已绑定当前账号。</p>}
    <section className={styles.comparison} aria-labelledby="vip-comparison-title">
      <h2 id="vip-comparison-title">普通用户与 VIP，有什么不同？</h2>
      <div className={styles.tableWrap}><table><caption className={styles.srOnly}>普通用户与 VIP 权益对比</caption><thead><tr><th scope="col">权益</th><th scope="col">普通用户</th><th scope="col">VIP</th></tr></thead><tbody>{benefits.map(item => <tr key={item.label}><th scope="row">{item.label}</th><td><span aria-hidden="true">{item.free ? "✓" : "—"}</span><span className={styles.srOnly}>{item.free ? "支持" : "不支持"}</span></td><td><span aria-hidden="true">✓</span><span className={styles.srOnly}>支持</span></td></tr>)}</tbody></table></div>
    </section>
    {status && <form id="vip-activation" className={styles.card} onSubmit={activate}>
      <div><h2>使用激活码</h2><p className={styles.subtitle}>粘贴云猫订单中的 24 位激活码</p></div>
      <div className={styles.field}><label htmlFor="vip-code">VIP 激活码</label>
      <input id="vip-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={24} maxLength={64} disabled={busy} placeholder="输入或粘贴激活码" /></div>
      <button className={styles.primary} type="submit" disabled={busy || code.trim().length < 24}>{busy ? "正在处理…" : `确认激活 ${days} 天 VIP`}</button>
      <p className={styles.note}>每个激活码仅可绑定一个账号，请确认当前登录账号。激活码不要公开或转发。</p>
    </form>}
    {!status && <p role="status" className={styles.note}>暂时无法读取会员状态，请刷新后再激活。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer className={styles.footer}>
      <div className={styles.actions}><button type="button" onClick={() => void refresh()} disabled={busy}><svg className={styles.actionIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4v5h-5M4 20v-5h5" /><path d="M4.6 9a8 8 0 0 1 13.2-4L20 9M4 15l2.2 4A8 8 0 0 0 19.4 15" /></svg>{busy ? "正在处理…" : "刷新会员状态"}</button><button type="button" onClick={openContactDialog}><svg className={styles.actionIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v-2a8 8 0 0 1 16 0v2M20 17v1a3 3 0 0 1-3 3h-3" /><rect x="2" y="11" width="4" height="7" rx="2" /><rect x="18" y="11" width="4" height="7" rx="2" /><path d="M12 21h2" /></svg>联系客服</button></div>
      <p className={styles.afterSales}>会员到期后，高级筛选将停止生效。重复购卡并激活后，有效期顺延。卡密通过云猫发放，遇到支付相关问题，请保留云猫订单号并联系 LiLink 官方客服；付款后不允许退款。</p>
    </footer>
    <dialog ref={contactDialog} className={styles.contactDialog} aria-labelledby="vip-contact-title" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); contactDialog.current?.close(); } }} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) contactDialog.current?.close();
      }
    }}>
      <h2 id="vip-contact-title">联系客服</h2>
      <section className={styles.contactMethod}><h3>联系邮箱</h3><a href="mailto:support@lilink.top">support@lilink.top</a></section>
      <section className={styles.contactMethod}><h3>运营微信</h3><p>LiLink5201314</p><SocialQr channel={socialChannels[0]} className={styles.contactQr} /><p className={styles.note}>扫描二维码，添加运营微信</p></section>
      <form method="dialog"><button ref={contactCloseButton} className={styles.primary} autoFocus>关闭</button></form>
    </dialog>
  </section>;
}
