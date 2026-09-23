"use client";

import { InteractiveFields } from "@/components/interactive-fields";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { fetchApi, isApiRequestError } from "../../../lib/api";
import { SocialQr, socialChannels } from "../../_components/SocialQr";
import { CheckCircleIcon } from "../_components/icons";
import { FiltersIcon, PriorityIcon, VipCrown, VipOrbits } from "./vip-art";
import styles from "./vip.module.css";
import faqStyles from "../../faq/faq.module.css";

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

function formatDate(value: string, dateOnly = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" } as const),
  }).format(new Date(value));
}

export function VipClient({ initialStatus }: { initialStatus: VipStatus | null }) {
  const activationDialog = useRef<HTMLDialogElement>(null);
  const activationTrigger = useRef<HTMLButtonElement>(null);
  const activationOpener = useRef<HTMLButtonElement>(null);
  const activationInput = useRef<HTMLInputElement>(null);
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
    activationDialog.current?.close();
    resultCloseButton.current?.focus({ preventScroll: true });
  }, [feedback]);

  function openActivationDialog(event: MouseEvent<HTMLButtonElement>) {
    activationOpener.current = event.currentTarget;
    activationDialog.current?.showModal();
    activationInput.current?.focus({ preventScroll: true });
  }

  function closeActivationDialog() {
    if (!submitting.current) activationDialog.current?.close();
  }

  function restoreActivationFocus() {
    const opener = activationOpener.current;
    (opener?.isConnected && !opener.disabled ? opener : activationTrigger.current)?.focus({ preventScroll: true });
  }

  function returnFromFeedback() {
    if (feedback?.tone === "error") {
      activationDialog.current?.showModal();
      activationSubmit.current?.focus({ preventScroll: true });
    } else restoreActivationFocus();
  }

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

  const active = Boolean(status?.active);
  const filtersAvailable = Boolean(status?.advancedFiltersAvailable);
  const days = status?.durationDays ?? 30;
  const price = Number(status?.priceYuan ?? 29.9).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const benefits = [
    { label: "每周匹配", free: true },
    { label: "优先匹配", free: false },
    { label: "年龄与性别偏好", free: true },
    { label: "吸烟情况筛选", free: true },
    { label: "饮酒频率筛选", free: true },
    { label: "锻炼频率筛选", free: false },
    { label: "学校筛选", free: false },
    { label: "身高筛选", free: false },
    { label: "体重筛选", free: false },
    { label: "颜值筛选", free: false },
  ];
  return <section className={styles.page} aria-label="VIP 权益">
    <header className={styles.pageHeading}><Link className={styles.back} href="/dashboard/me">← 返回用户中心</Link><h1 className={styles.srOnly}>VIP 权益</h1></header>
    <section className={styles.membership} aria-label="会员方案与状态">
      <VipOrbits className={styles.decoration} />
      <div className={styles.cardHeading}><h2><VipCrown />LiLink VIP</h2><span className={styles.badge}>{!status ? "状态暂不可用" : active ? "已开通" : status.expiresAt ? "已到期" : "未开通"}</span></div>
      <p className={styles.expiry}>{status?.expiresAt ? `${active ? "有效期至" : "已于"} ${formatDate(status.expiresAt, true)}${active ? "" : " 到期"}` : status ? "开通专属权益，让相遇更合心意" : "暂时无法读取会员状态，请刷新后再激活。"}</p>
    </section>
    <section className={styles.perks} aria-labelledby="vip-perks-title">
      <h2 id="vip-perks-title">专属权益</h2>
      <div className={styles.perkGrid}>
        <article className={styles.perk}>
          <PriorityIcon className={styles.perkIcon} /><h3>优先匹配</h3>
          <p>参与每周匹配<br />享受优先安排</p>
          <span className={active ? styles.enabled : styles.inactive}>{active && <CheckCircleIcon />}{!status ? "状态待确认" : active ? "已生效" : "开通后生效"}</span>
        </article>
        <article className={styles.perk}>
          <FiltersIcon className={styles.perkIcon} /><h3>高级筛选</h3>
          <p>学校、身高等<br />5 项专属筛选</p>
          {status && filtersAvailable ? active ? <Link className={styles.manage} href="/dashboard/profile#profile-attention-hard_partner_looks">去设置 <span aria-hidden="true">→</span></Link> : <button type="button" className={styles.manage} onClick={openActivationDialog} disabled={busy}>去开通 <span aria-hidden="true">→</span></button> : <span className={styles.inactive}>{status ? "暂未开放" : "状态待确认"}</span>}
        </article>
      </div>
      <p className={styles.rule}><span aria-hidden="true">ⓘ</span>匹配需满足双方条件，连续两次参与未匹配的用户优先。</p>
    </section>
    <section className={styles.purchase} aria-labelledby="vip-renewal-title">
      <div className={styles.purchaseHeading}><h2 id="vip-renewal-title">{active ? "续费 VIP" : "开通 VIP"}</h2><p className={styles.price}><strong>¥{price}</strong><span> / {days} 天</span></p></div>
      <p className={styles.purchaseNote}>{active ? "新激活码可顺延 30 天" : "从激活时起享受 30 天权益"}</p>
      <div className={styles.purchaseActions}>
        <a className={styles.purchaseButton} href="https://catfk.com/item/ry2djy" target="_blank" rel="noopener noreferrer">购买激活码 <span aria-hidden="true">↗</span></a>
        <button ref={activationTrigger} type="button" className={styles.primary} onClick={openActivationDialog} disabled={!status || busy}>使用激活码</button>
      </div>
      <p className={styles.purchaseHelp}>云猫购买，返回本站激活</p>
    </section>
    <section className={styles.faq} aria-labelledby="vip-faq-title">
      <h2 id="vip-faq-title" className={`${faqStyles.title} ${styles.faqTitle}`}>常见问题</h2>
      <div className={faqStyles.list}>
        <details className={`${faqStyles.item} ${styles.faqItem}`}>
          <summary>VIP 与普通用户有什么区别？</summary>
          <div className={`${faqStyles.answer} ${styles.faqAnswer}`}>
            <div className={styles.tableWrap}><table><caption className={styles.srOnly}>普通用户与 VIP 权益对比</caption><thead><tr><th scope="col">权益</th><th scope="col">普通用户</th><th scope="col">VIP</th></tr></thead><tbody>{benefits.map(item => <tr key={item.label}><th scope="row">{item.label}</th><td><span aria-hidden="true">{item.free ? "✓" : "—"}</span><span className={styles.srOnly}>{item.free ? "支持" : "不支持"}</span></td><td><span aria-hidden="true">✓</span><span className={styles.srOnly}>支持</span></td></tr>)}</tbody></table></div>
          </div>
        </details>
        <details className={`${faqStyles.item} ${styles.faqItem}`}>
          <summary>会员到期后会怎样？</summary>
          <div className={`${faqStyles.answer} ${styles.faqAnswer}`}>会员到期后，优先匹配与高级筛选将停止生效。每周匹配等免费权益不受影响。</div>
        </details>
        <details className={`${faqStyles.item} ${styles.faqItem}`}>
          <summary>重复激活如何计算？</summary>
          <div className={`${faqStyles.answer} ${styles.faqAnswer}`}>每张新激活码增加 30 天；有效期内激活，剩余天数顺延。重复使用同一激活码不会增加时长。</div>
        </details>
        <details className={`${faqStyles.item} ${styles.faqItem}`}>
          <summary>购买后遇到问题，如何处理？</summary>
          <div className={`${faqStyles.answer} ${styles.faqAnswer}`}>卡密通过云猫发放。遇到支付相关问题，请保留云猫订单号并联系 LiLink 官方客服；付款后不允许退款。</div>
        </details>
      </div>
    </section>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer className={styles.actions}>
      <button type="button" onClick={() => void refresh()} disabled={busy}><svg className={styles.actionIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4v5h-5M4 20v-5h5" /><path d="M4.6 9a8 8 0 0 1 13.2-4L20 9M4 15l2.2 4A8 8 0 0 0 19.4 15" /></svg>{busy ? "正在处理…" : "刷新状态"}</button>
      <button type="button" onClick={openContactDialog}><svg className={styles.actionIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13v-2a8 8 0 0 1 16 0v2M20 17v1a3 3 0 0 1-3 3h-3" /><rect x="2" y="11" width="4" height="7" rx="2" /><rect x="18" y="11" width="4" height="7" rx="2" /></svg>联系客服</button>
    </footer>
    <dialog ref={activationDialog} className={styles.activationDialog} aria-labelledby="vip-activation-title" aria-describedby="vip-activation-description" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeActivationDialog(); } }} onCancel={event => { if (submitting.current) event.preventDefault(); }} onClose={() => { if (!resultDialog.current?.open) restoreActivationFocus(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeActivationDialog();
    }}>
      <button className={styles.dialogClose} type="button" aria-label="关闭激活弹窗" onClick={closeActivationDialog} disabled={busy}>×</button>
      <h2 id="vip-activation-title">使用激活码</h2>
      <p className={styles.activationSubtitle}>开通或续费 {days} 天 VIP</p>
      <p id="vip-activation-description" className={styles.note}>有效期内激活，剩余天数顺延</p>
      <InteractiveFields><form id="vip-activation" onSubmit={activate} noValidate>
        <div className={styles.field}><label htmlFor="vip-code">VIP 激活码</label>
        <input ref={activationInput} id="vip-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={24} maxLength={64} disabled={busy} placeholder="输入或粘贴 24 位激活码" /></div>
        <button ref={activationSubmit} className={styles.primary} type="submit" disabled={busy} aria-label={`确认激活 ${days} 天 VIP`}>{busy ? "正在处理…" : "确认激活"}</button>
        <p className={styles.note}>激活后绑定当前账号，请勿公开或转发。</p>
      </form></InteractiveFields>
    </dialog>
    <dialog ref={resultDialog} className={styles.resultDialog} aria-labelledby="vip-result-title" aria-describedby="vip-result-message" onClose={returnFromFeedback}>
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
