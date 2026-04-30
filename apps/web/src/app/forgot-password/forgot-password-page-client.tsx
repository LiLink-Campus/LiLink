"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";
import { useLocale } from "../locale-context";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const VERIFICATION_CODE_LENGTH = 6;
const FORGOT_PASSWORD_COPY = {
  "zh-CN": {
    sendFallback: "验证码发送失败，请稍后再试。",
    passwordMismatch: "两次输入的密码不一致，请重新确认。",
    resetFallback: "重置失败，请重试。",
    step: (step: number) => `Reset password · Step ${step} / 2`,
    title: "重置密码",
    introOne: "输入你的学校邮箱，我们会发送验证码来验证你的身份。",
    introTwo: "请输入验证码并设置新密码。",
    email: "学校邮箱",
    sending: "发送中…",
    sendCode: "发送验证码",
    sentTo: "已发送到",
    spamHint:
      "几分钟内仍未收到？请检查邮箱的「垃圾邮件」或「拦截邮件」文件夹，部分学校邮箱会自动拦截首次发件人。",
    devCode: "开发环境验证码：",
    code: "验证码",
    codePlaceholder: "6 位验证码",
    newPassword: "新密码",
    passwordPlaceholder: (min: number) => `至少 ${min} 位，含字母和数字`,
    confirmPassword: "确认新密码",
    confirmPasswordPlaceholder: "再次输入新密码",
    back: "重新输入邮箱",
    resetting: "重置中…",
    reset: "重置密码",
    remembered: "想起密码了？",
    login: "返回登录",
  },
  "en-US": {
    sendFallback: "Verification code could not be sent. Please try again.",
    passwordMismatch: "The two passwords do not match.",
    resetFallback: "Password reset failed. Please try again.",
    step: (step: number) => `Reset password · Step ${step} / 2`,
    title: "Reset password",
    introOne:
      "Enter your school email and we will send a code to verify your identity.",
    introTwo: "Enter the code and set a new password.",
    email: "School email",
    sending: "Sending...",
    sendCode: "Send code",
    sentTo: "Sent to",
    spamHint:
      "Still no email after a few minutes? Check your spam or blocked-mail folder. Some school mail systems block first-time senders.",
    devCode: "Development code: ",
    code: "Code",
    codePlaceholder: "6-digit code",
    newPassword: "New password",
    passwordPlaceholder: (min: number) =>
      `At least ${min} characters with letters and numbers`,
    confirmPassword: "Confirm new password",
    confirmPasswordPlaceholder: "Enter the new password again",
    back: "Change email",
    resetting: "Resetting...",
    reset: "Reset password",
    remembered: "Remembered it?",
    login: "Back to login",
  },
} as const;

type CodeResponse = {
  email: string;
  expiresAt: string;
  devCode?: string;
};

export default function ForgotPasswordPageClient() {
  const { locale } = useLocale();
  const copy = FORGOT_PASSWORD_COPY[locale];
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
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

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setStep(2);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : copy.sendFallback,
      );
    } finally {
      setPending(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    if (newPassword !== passwordConfirm) {
      setError(copy.passwordMismatch);
      setPending(false);
      return;
    }

    try {
      await fetchApi("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, code, newPassword }),
      });

      window.location.href = "/dashboard";
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : copy.resetFallback,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-shell prose-shell auth-shell">
      <section className="content-panel auth-panel animate-in">
        <div className="auth-panel-mark" aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        <p className="eyebrow">{copy.step(step)}</p>
        <h1>{copy.title}</h1>
        {step === 1 ? (
          <p>{copy.introOne}</p>
        ) : (
          <p>{copy.introTwo}</p>
        )}

        {step === 1 ? (
          <form className="auth-form" onSubmit={requestCode}>
            <label>
              <span>{copy.email}</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your.name@school.edu"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button
              className="button-primary button-block"
              disabled={pending}
              type="submit"
            >
              {pending ? copy.sending : copy.sendCode}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={resetPassword}>
            <div className="dev-inline">
              <span>{copy.sentTo}</span>
              <strong>{email}</strong>
            </div>
            <p className="auth-hint">{copy.spamHint}</p>
            {canRevealDevCode && devCode ? (
              <p className="dev-note">
                {copy.devCode}
                {devCode}
              </p>
            ) : null}
            <label>
              <span>{copy.code}</span>
              <input
                required
                value={code}
                maxLength={VERIFICATION_CODE_LENGTH}
                autoComplete="one-time-code"
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                placeholder={copy.codePlaceholder}
              />
            </label>
            <label>
              <span>{copy.newPassword}</span>
              <input
                required
                type="password"
                value={newPassword}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={copy.passwordPlaceholder(PASSWORD_MIN_LENGTH)}
              />
            </label>
            <label>
              <span>{copy.confirmPassword}</span>
              <input
                required
                type="password"
                value={passwordConfirm}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder={copy.confirmPasswordPlaceholder}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="auth-actions">
              <button
                className="button-secondary"
                disabled={pending}
                type="button"
                onClick={() => setStep(1)}
              >
                {copy.back}
              </button>
              <button
                className="button-primary"
                disabled={
                  pending ||
                  newPassword !== passwordConfirm ||
                  newPassword.length < PASSWORD_MIN_LENGTH
                }
                type="submit"
              >
                {pending ? copy.resetting : copy.reset}
              </button>
            </div>
          </form>
        )}

        <p className="auth-hint">
          {copy.remembered} <Link href="/login">{copy.login}</Link>
        </p>
      </section>
      <div className="auth-grass-line" aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
