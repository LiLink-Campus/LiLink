"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button, Card, Field, FormMessage, Input } from "@/components/ui";
import { ActionGroup } from "@/components/semantic";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const VERIFICATION_CODE_LENGTH = 6;

type CodeResponse = {
  email: string;
  expiresAt: string;
  devCode?: string;
};

export default function ForgotPasswordPageClient() {
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
          : "验证码发送失败，请稍后再试。",
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
      setError("两次输入的密码不一致，请重新确认。");
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
          : "重置失败，请重试。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page-shell prose-shell auth-shell">
      <Card className="auth-panel animate-in" layout="plain">
        <div className="auth-panel-mark" aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        <p className="eyebrow">Reset password · Step {step} / 2</p>
        <h1>重置密码</h1>
        {step === 1 ? (
          <p>输入你的学校邮箱，我们会发送验证码来验证你的身份。</p>
        ) : (
          <p>请输入验证码并设置新密码。</p>
        )}

        {step === 1 ? (
          <form className="auth-stack" onSubmit={requestCode}>
            <Field label="学校邮箱">
              <Input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your.name@school.edu"
              />
            </Field>
            {error ? <FormMessage>{error}</FormMessage> : null}
            <Button
              block
              disabled={pending}
              type="submit"
            >
              {pending ? "发送中…" : "发送验证码"}
            </Button>
          </form>
        ) : (
          <form className="auth-stack" onSubmit={resetPassword}>
            <div className="dev-inline">
              <span>已发送到</span>
              <strong>{email}</strong>
            </div>
            <p className="auth-hint">
              几分钟内仍未收到？请检查邮箱的「垃圾邮件」或「拦截邮件」文件夹，部分学校邮箱会自动拦截首次发件人。
            </p>
            {canRevealDevCode && devCode ? (
              <p className="dev-note">开发环境验证码：{devCode}</p>
            ) : null}
            <Field label="验证码">
              <Input
                required
                value={code}
                maxLength={VERIFICATION_CODE_LENGTH}
                autoComplete="one-time-code"
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                placeholder="6 位验证码"
              />
            </Field>
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
            <ActionGroup className="auth-actions">
              <Button
                variant="secondary"
                disabled={pending}
                type="button"
                onClick={() => setStep(1)}
              >
                重新输入邮箱
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

        <p className="auth-hint">
          想起密码了？<Link href="/login">返回登录</Link>
        </p>
      </Card>
      <div className="auth-grass-line" aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
