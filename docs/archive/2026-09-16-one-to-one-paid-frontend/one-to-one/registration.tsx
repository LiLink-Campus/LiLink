"use client";
import { useRef, useState } from "react";
import { fetchApi } from "../../lib/api";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { PhoneCountryPicker } from "../dashboard/profile/phone-country-picker";
import styles from "./registration.module.css";

export function RegistrationButton({ className }: { className: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>("CN");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  return <><button className={className} type="button" onClick={() => dialog.current?.showModal()}>免费登记意向 ↗</button>
    <dialog ref={dialog} className={styles.dialog} aria-label="免费登记意向">
      <button type="button" className={styles.close} aria-label="关闭登记" onClick={() => dialog.current?.close()}>×</button>
      <h2>让我们联系你</h2>
      {success ? <div role="status"><h3>登记成功</h3><p>运营人员会通过你填写的手机号主动联系你，了解你的匹配期待。登记不收取费用。</p><button className={styles.submit} onClick={() => dialog.current?.close()}>知道了</button></div> : <form onSubmit={async event => {
        event.preventDefault(); if(busy)return; setError("");
        const full = "+" + getCountryCallingCode(country) + phone.replace(/[\s()-]/g, "").replace(/^0+/, "");
        if(!/^\+[1-9]\d{7,14}$/.test(full)){setError("请检查国家区号和手机号。");return;}
        setBusy(true);
        try { await fetchApi('/public/match-leads', {method:'POST',body:JSON.stringify({phone:full,consent})});setSuccess(true); } catch {setError("登记未成功，请稍后重试。");} finally {setBusy(false);}
      }}>
        <p>登记免费。留下手机号，运营人员会主动联系你。双方互选且愿意进一步了解后，才需要付费。</p>
        <div className={styles.phone}><div className={styles.country}><span>国家区号</span><PhoneCountryPicker value={country} onChange={setCountry} /></div><label>手机号<input type="tel" autoComplete="tel-national" value={phone} onChange={e=>setPhone(e.target.value)} required maxLength={24} placeholder="请输入手机号" /></label></div>
        <label className={styles.consent}><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)} />我同意 LiLink 使用该手机号联系我，沟通本次人工匹配服务。</label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className={styles.submit} disabled={busy}>{busy ? "正在提交…" : "免费提交登记"}</button>
      </form>}
    </dialog></>;
}
