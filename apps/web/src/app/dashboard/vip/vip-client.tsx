"use client";

import { InteractiveFields } from "@/components/interactive-fields";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchApi, isApiRequestError } from "../../../lib/api";
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

type ActivationResponse = VipStatus & {
  activationOutcome?: "ACTIVATED" | "EXTENDED" | "REACTIVATED" | "ALREADY_REDEEMED";
  previousExpiresAt?: string | null;
};

type ActivationFeedback = {
  tone: "success" | "info" | "error";
  title: string;
  message: string;
  expiresAt?: string | null;
  previousExpiresAt?: string | null;
  active?: boolean;
};

function activationFeedback(result: ActivationResponse): ActivationFeedback {
  const details = { expiresAt: result.expiresAt, active: result.active };
  if (result.activationOutcome === "ALREADY_REDEEMED") return {
    ...details, tone: "info", title: "此激活码已兑换",
    message: result.active ? "此码已绑定当前账号，本次未增加会员时长。" : "此码已绑定当前账号，会员已到期。请使用新的激活码重新开通。",
  };
  if (!result.active) return { ...details, tone: "info", title: "当前会员未生效", message: "请核对会员状态；已兑换的旧码不会再次增加时长。如有疑问，请联系客服。" };
  switch (result.activationOutcome) {
    case "ACTIVATED":
    case "REACTIVATED": return { ...details, tone: "success", title: "VIP 开通成功", message: "30 天会员已绑定当前账号，从本次激活时开始计时。" };
    case "EXTENDED": return { ...details, tone: "success", title: "VIP 续费成功", message: "已在原到期时间后顺延 30 天，原有剩余时长完整保留。", previousExpiresAt: result.previousExpiresAt };
    default: return { ...details, tone: "info", title: "会员状态已更新", message: "请以下方到期时间为准。重复提交已兑换的卡密不会增加时长。" };
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function VipClient({ initialStatus }: { initialStatus: VipStatus | null }) {
  const contactDialog = useRef<HTMLDialogElement>(null);
  const contactCloseButton = useRef<HTMLButtonElement>(null);
  const resultDialog = useRef<HTMLDialogElement>(null);
  const resultCloseButton = useRef<HTMLButtonElement>(null);
  const activationSubmit = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [status, setStatus] = useState(initialStatus);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActivationFeedback | null>(null);

  useEffect(() => {
    if (!feedback) return;
    resultDialog.current?.showModal();
    resultCloseButton.current?.focus({ preventScroll: true });
  }, [feedback]);

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
    if (busy || submitting.current) return;
    const normalized = code.trim().replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{24}$/.test(normalized)) {
      setFeedback({ tone: "error", title: "请检查激活码", message: "请输入完整的 24 位字母或数字激活码，可直接粘贴云猫订单中的卡密。" });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchApi<ActivationResponse>("/me/vip/activate", { method: "POST", body: JSON.stringify({ code: normalized }) });
      setStatus(result);
      setCode("");
      setFeedback(activationFeedback(result));
    } catch (cause) {
      const uncertain = !isApiRequestError(cause) || cause.status >= 500;
      const message = uncertain
        ? "网络或服务暂时不可用，请先刷新会员状态，再重试。"
        : cause.status === 429 ? "操作太频繁，请稍等一分钟后再试。" : cause.message;
      setFeedback({ tone: "error", title: uncertain ? "暂未确认激活结果" : "激活未完成", message });
    }
    finally { submitting.current = false; setBusy(false); }
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
    <section className={styles.comparison} aria-labelledby="vip-comparison-title">
      <h2 id="vip-comparison-title">普通用户与 VIP，有什么不同？</h2>
      <div className={styles.tableWrap}><table><caption className={styles.srOnly}>普通用户与 VIP 权益对比</caption><thead><tr><th scope="col">权益</th><th scope="col">普通用户</th><th scope="col">VIP</th></tr></thead><tbody>{benefits.map(item => <tr key={item.label}><th scope="row">{item.label}</th><td><span aria-hidden="true">{item.free ? "✓" : "—"}</span><span className={styles.srOnly}>{item.free ? "支持" : "不支持"}</span></td><td><span aria-hidden="true">✓</span><span className={styles.srOnly}>支持</span></td></tr>)}</tbody></table></div>
    </section>
    {status && <InteractiveFields><form id="vip-activation" className={styles.card} onSubmit={activate} noValidate>
      <div><h2>使用激活码</h2><p className={styles.subtitle}>粘贴云猫订单中的 24 位激活码</p></div>
      <div className={styles.field}><label htmlFor="vip-code">VIP 激活码</label>
      <input id="vip-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={24} maxLength={64} disabled={busy} placeholder="输入或粘贴激活码" /></div>
      <button ref={activationSubmit} className={styles.primary} type="submit" disabled={busy}>{busy ? "正在处理…" : `确认激活 ${days} 天 VIP`}</button>
      <p className={styles.note}>每个激活码仅可绑定一个账号，请确认当前登录账号。激活码不要公开或转发。</p>
    </form></InteractiveFields>}
    {!status && <p role="status" className={styles.note}>暂时无法读取会员状态，请刷新后再激活。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer className={styles.footer}>
      <div className={styles.actions}><button type="button" onClick={() => void refresh()} disabled={busy}><svg className={styles.actionIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4v5h-5M4 20v-5h5" /><path d="M4.6 9a8 8 0 0 1 13.2-4L20 9M4 15l2.2 4A8 8 0 0 0 19.4 15" /></svg>{busy ? "正在处理…" : "刷新会员状态"}</button><button type="button" onClick={openContactDialog}><svg className={styles.actionIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v-2a8 8 0 0 1 16 0v2M20 17v1a3 3 0 0 1-3 3h-3" /><rect x="2" y="11" width="4" height="7" rx="2" /><rect x="18" y="11" width="4" height="7" rx="2" /><path d="M12 21h2" /></svg>联系客服</button></div>
      <p className={styles.afterSales}>会员到期后，高级筛选将停止生效。重复购卡并激活后，有效期顺延。卡密通过云猫发放，遇到支付相关问题，请保留云猫订单号并联系 LiLink 官方客服；付款后不允许退款。</p>
    </footer>
    <dialog ref={resultDialog} className={styles.resultDialog} aria-labelledby="vip-result-title" aria-describedby="vip-result-message" onClose={() => activationSubmit.current?.focus({ preventScroll: true })}>
      {feedback && <>
        <div className={styles.resultIcon} data-tone={feedback.tone} aria-hidden="true">
          {feedback.tone === "success" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : feedback.tone === "error" ? "!" : "i"}
        </div>
        <h2 id="vip-result-title">{feedback.title}</h2>
        <p id="vip-result-message">{feedback.message}</p>
        {feedback.expiresAt && <div className={styles.resultExpiry}>
          {feedback.previousExpiresAt && <p>原到期时间：{formatDate(feedback.previousExpiresAt)}</p>}
          <span>{feedback.active ? "会员到期时间" : "会员已于以下时间到期"}</span>
          <time dateTime={feedback.expiresAt}>{formatDate(feedback.expiresAt)}</time>
          <small>北京时间</small>
        </div>}
        <form method="dialog"><button ref={resultCloseButton} className={styles.primary} autoFocus>知道了</button></form>
      </>}
    </dialog>
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
