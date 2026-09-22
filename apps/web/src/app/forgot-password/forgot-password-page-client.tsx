"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { ActionGroup } from "@/components/semantic";
import { InteractiveFields } from "@/components/interactive-fields";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
} from "../dashboard/_components/illustrations";
import loginStyles from "../login/login.module.css";
import flowStyles from "../register/register-flow.module.css";
import styles from "./forgot-password.module.css";
import authStyles from "../auth.module.css";
import layoutStyles from "../public-layout.module.css";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const VERIFICATION_CODE_LENGTH = 6;

type CodeResponse = {
  email: string;
  expiresAt: string;
  devCode?: string;
};

export default function ForgotPasswordPageClient({ initialEmail = "" }: { initialEmail?: string }) {
  const signedIn = Boolean(initialEmail);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(initialEmail);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canRevealDevCode, setCanRevealDevCode] = useState(false);

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
  }, []);

  async function requestCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("请填写有效的注册邮箱。"); return; }
    setPending(true);
    setError(null);

    try {
      const result = await fetchApi<CodeResponse>(
        "/auth/request-password-reset-code",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
      );

      setDevCode(result.devCode);
      setCodeSent(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "验证码发送失败，请稍后再试。",
      );
    } finally {
      setPending(false);
    }
  }

  function continueToPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!codeSent || !/^\d{6}$/.test(code))) { setError("请先获取并填写 6 位验证码。"); return; }
    setError(null);
    setStep(2);
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    if (newPassword !== passwordConfirm) {
      setError("两次输入的密码不一致，请重新确认。");
      setPending(false);
      return;
    }

    try {
      await fetchApi("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, code, newPassword }),
      });

      window.location.href = signedIn ? "/dashboard/me" : "/dashboard";
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "重置失败，请重试。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      className={`${layoutStyles.pageShell} ${layoutStyles.proseShell} ${authStyles.shell} ${step === 2 ? flowStyles.shell : ""}`}
    >
      {step === 2 ? <ol className={flowStyles.progress} aria-label="重置密码进度">
        <li><span className={flowStyles.dot}>1</span>邮箱验证</li>
        <li className={flowStyles.active} aria-current="step"><span className={flowStyles.dot}>2</span>设置新密码</li>
      </ol> : null}
      <Card className={`${authStyles.panel} ${step === 1 ? loginStyles.card : flowStyles.panel} ${styles.panel} animate-in`} layout="plain">
        <h1>重置密码</h1>
        {step === 1 ? (
          <p className={styles.subtitle}>{signedIn ? "已填入你的注册邮箱，获取验证码后继续设置新密码。" : "输入注册邮箱和验证码，继续设置新密码。"}</p>
        ) : (
          <p className={`${styles.subtitle} ${styles.stepTwoSubtitle}`}>设置新密码，提交时将核验邮箱验证码。</p>
        )}

        <InteractiveFields>
        {step === 1 ? (
          <form className={authStyles.stack} onSubmit={continueToPassword}>
            <Field label="注册邮箱">
              <Input
                required
                type="email"
                disabled={signedIn || pending}
                autoComplete="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setCodeSent(false); setCode(""); setDevCode(undefined); setError(null); }}
                placeholder="your.name@school.edu"
              />
            </Field>
            <div className={flowStyles.codeRow}>
              <Field label="验证码"><Input required value={code} maxLength={VERIFICATION_CODE_LENGTH} autoComplete="one-time-code" inputMode="numeric" onChange={(event) => setCode(event.target.value)} placeholder="6 位验证码" /></Field>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => void requestCode()}>{pending ? "发送中…" : codeSent ? "重新发送" : "发送验证码"}</Button>
            </div>
            {codeSent ? <p className={styles.delivery} role="status">验证码已发送，请检查收件箱或垃圾邮件。</p> : null}
            {canRevealDevCode && devCode ? <p className={authStyles.devNote}>开发环境验证码：{devCode}</p> : null}
            {error ? <FormMessage>{error}</FormMessage> : null}
            <Button block disabled={pending} type="submit">下一步</Button>
          </form>
        ) : (
          <form className={authStyles.stack} onSubmit={resetPassword}>
            <div className={flowStyles.emailSummary}>
              <span>已发送到</span>
              <strong>{email}</strong>
            </div>
            <Field label="新密码">
              <Input
                required
                type="password"
                value={newPassword}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位，含字母和数字`}
              />
            </Field>
            <Field label="确认新密码">
              <Input
                required
                type="password"
                value={passwordConfirm}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="再次输入新密码"
              />
            </Field>
            {error ? <FormMessage>{error}</FormMessage> : null}
            <ActionGroup className={authStyles.actions}>
              <Button
                variant="secondary"
                disabled={pending}
                type="button"
                onClick={() => { setStep(1); setError(null); }}
              >
                {signedIn ? "修改验证码" : "修改邮箱或验证码"}
              </Button>
              <Button
                disabled={
                  pending ||
                  newPassword !== passwordConfirm ||
                  newPassword.length < PASSWORD_MIN_LENGTH
                }
                type="submit"
              >
                {pending ? "重置中…" : "重置密码"}
              </Button>
            </ActionGroup>
          </form>
        )}
        </InteractiveFields>

        <p className={authStyles.hint}>
          {signedIn ? <Link href="/dashboard/me">← 返回用户中心</Link> : <>想起密码了？<Link href="/login">返回登录</Link></>}
        </p>
      </Card>
      <div className={authStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
