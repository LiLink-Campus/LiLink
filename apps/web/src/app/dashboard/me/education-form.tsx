"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { EducationStatus } from "@lilink/shared";
import { Button, Field, Input, Select } from "@/components/ui";
import { isApiRequestError } from "../../../lib/api";
import { isAccountActionCancelled, useAccountActionRequest } from "../_lib/use-account-action-request";
import { useRegistrationSchools } from "../../register/use-registration-schools";
import styles from "./education-card.module.css";

export function EducationForm({ mode, onVerified, onBusy }: { onBusy: (busy: boolean) => void; mode: "invite" | "email"; onVerified: (status: EducationStatus) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [checkingResult, setCheckingResult] = useState(false);
  const { request, isMounted } = useAccountActionRequest();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    if (pending) return;
    setPending(true); onBusy(true); setError(""); setNotice("");
    try {
      await request("/me/education/email/request-code", { method: "POST", body: JSON.stringify({ email }) });
      if (!isMounted()) return;
      setSentTo(email.trim().toLowerCase()); setCode(""); setCooldown(30);
      setNotice("验证码已发送，请检查收件箱或垃圾邮件。");
    } catch (caught) {
      if (!isMounted() || isAccountActionCancelled(caught)) return;
      if (isApiRequestError(caught) && caught.status === 429) {
        setCooldown(30); setError("验证码请求过于频繁，请稍后重试。");
      } else if (!isApiRequestError(caught) || caught.status >= 500) {
        setSentTo(email.trim().toLowerCase()); setCooldown(30);
        setError("验证码发送结果待确认，请先检查收件箱或垃圾邮件；收到验证码后可继续认证，未收到请稍后重发。");
      } else setError(caught.message);
    } finally { if (isMounted()) { setPending(false); onBusy(false); } }
  }

  async function confirmResult() {
    setCheckingResult(true);
    try {
      const result = await request<EducationStatus>("/me/education");
      if (!isMounted()) return;
      if (typeof result?.verified !== "boolean" || !(result.schoolName === null || typeof result.schoolName === "string")) throw new Error("Invalid education status");
      if (result.verified) onVerified(result);
      else {
        setUncertain(false);
        setError("当前尚未通过教育认证。确认填写无误后，可重新提交；重复认证不会重复扣减邀请名额。");
      }
    } catch (caught) {
      if (isMounted() && !isAccountActionCancelled(caught)) setError("认证结果待确认，暂时无法读取最新状态。请重新确认认证结果后再提交，也可以先关闭窗口。");
    } finally { if (isMounted()) setCheckingResult(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uncertain) return;
    setPending(true); onBusy(true); setError(""); setNotice("");
    try {
      const result = await request<EducationStatus>(mode === "invite" ? "/me/education/invite" : "/me/education/email/verify", {
        method: "POST", body: JSON.stringify(mode === "invite" ? { referralCode, schoolId } : { email, code }),
      });
      if (isMounted()) onVerified(result);
    } catch (caught) {
      if (!isMounted() || isAccountActionCancelled(caught)) return;
      if (isApiRequestError(caught) && caught.status < 500) setError(caught.message);
      else {
        setUncertain(true); setPending(false); onBusy(false);
        setError("认证结果待确认，正在读取最新状态，请勿重复提交。");
        await confirmResult();
      }
    } finally { if (isMounted()) { setPending(false); onBusy(false); } }
  }

  return <form className={styles.form} onSubmit={submit}>
    <fieldset disabled={pending || uncertain} className={styles.fields}>
      {mode === "invite" ? <>
        <Field label="邀请码"><Input required maxLength={64} value={referralCode} autoComplete="off" onChange={event => setReferralCode(event.target.value)} placeholder="填写同学分享的邀请码" /></Field>
        <EducationSchool value={schoolId} onChange={setSchoolId} />
      </> : <>
        <Field label="教育邮箱" hint="使用合作高校邮箱验证，原来的登录邮箱不变。"><Input required type="email" maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setCode(""); setNotice(""); }} placeholder="你的学校邮箱" /></Field>
        <div className={styles.codeRow}>
        <Field label="认证验证码"><Input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} /></Field>
        <Button variant="secondary" type="button" disabled={cooldown > 0 || !email.trim()} onClick={() => void sendCode()}>{cooldown > 0 ? `${cooldown}s 后重发` : "发送验证码"}</Button>
        </div>
      </>}
      {notice && <p role="status">{notice}</p>}
      <Button type="submit" disabled={mode === "email" && (sentTo !== email.trim().toLowerCase() || !sentTo)}>{pending ? "认证中…" : mode === "invite" ? "确认邀请码认证" : "完成教育邮箱认证"}</Button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {uncertain && <Button type="button" variant="secondary" disabled={checkingResult} onClick={() => void confirmResult()}>{checkingResult ? "正在确认认证结果…" : "重新确认认证结果"}</Button>}
  </form>;
}

function EducationSchool({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { payload, pending, error, reload } = useRegistrationSchools();
  return <>
    <Field label="认证学校"><Select className={styles.schoolSelect} required value={value} onChange={event => onChange(event.target.value)} disabled={pending}>
      <option value="">{pending ? "正在加载学校…" : "请选择你的学校"}</option>
      {payload?.schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
    </Select></Field>
    {error && <><p role="alert">{error}</p><Button variant="secondary" type="button" onClick={() => void reload()}>重试学校列表</Button></>}
  </>;
}
