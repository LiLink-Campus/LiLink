"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 30;
const VERIFICATION_CODE_LENGTH = 6;
const INVITE_CODE_MAX_LENGTH = 64;

function loginHrefFromSearch(search: string) {
  const nextPath = new URLSearchParams(search).get("next");
  if (!nextPath) {
    return "/login";
  }

  return `/login?${new URLSearchParams({ next: nextPath }).toString()}`;
}

type CodeResponse = {
  email: string;
  expiresAt: string;
  school?: {
    schoolName: string;
    matchedDomain: string;
  } | null;
  devCode?: string;
};

export default function RegisterPageClient() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [resolvedSchool, setResolvedSchool] = useState<CodeResponse["school"]>(
    null,
  );
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canRevealDevCode, setCanRevealDevCode] = useState(false);
  const [loginHref, setLoginHref] = useState("/login");

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
    setLoginHref(loginHrefFromSearch(window.location.search));
  }, []);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await fetchApi<CodeResponse>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      setResolvedSchool(result.school ?? null);
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

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!acceptedTerms) {
      setError("请先勾选并同意用户协议和隐私政策。");
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`密码至少 ${PASSWORD_MIN_LENGTH} 位，请重新输入。`);
      return;
    }

    if (password !== passwordConfirm) {
      setError("两次输入的密码不一致，请重新确认。");
      return;
    }

    setPending(true);

    try {
      await fetchApi("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          code,
          password,
          displayName,
          fullName,
          acceptedTerms,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });

      const nextPath = new URLSearchParams(window.location.search).get("next");
      const redirectPath =
        sanitizeSameOriginRelativePath(nextPath, window.location.origin) ??
        "/dashboard";
      window.location.href = redirectPath;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "注册失败，请重试。",
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
        <p className="eyebrow">Register · Step {step} / 2</p>
        <h1>{step === 1 ? "先验证身份" : "完善你的账号"}</h1>
        <p>
          {step === 1
            ? "LiLink 仅接受合作高校的学校邮箱。输入邮箱，我们来验证你的身份。"
            : "设置一个昵称和密码，准备好就可以参加下一轮匹配。"}
        </p>

        {step === 1 ? (
          <form className="auth-form" onSubmit={requestCode}>
            <label>
              <span>学校邮箱</span>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="your.name@school.edu"
              />
            </label>
            <EligibleSchoolsPanel emailInput={email} variant="compact" />
            {resolvedSchool ? (
              <p className="form-success">
                已识别学校：{resolvedSchool.schoolName}（@
                {resolvedSchool.matchedDomain}）
              </p>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            <button
              className="button-primary button-block"
              disabled={pending}
              type="submit"
            >
              {pending ? "发送中…" : "发送验证码"}
            </button>
            <p className="auth-hint">
              没找到你的学校？前往
              {" "}
              <Link href="/schools">完整学校列表</Link>
              {" "}
              查看，或在页脚联系我们补录。
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={register}>
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
            <label>
              <span>验证码</span>
              <input
                required
                value={code}
                maxLength={VERIFICATION_CODE_LENGTH}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder="6 位验证码"
              />
            </label>
            <label>
              <span>显示昵称</span>
              <input
                required
                value={displayName}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="别人会先看到这个昵称"
              />
            </label>
            <label>
              <span>真实姓名（可选）</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="可留空；仅在必要场景用于核验"
              />
            </label>
            <label>
              <span>邀请码（可选）</span>
              <input
                value={inviteCode}
                maxLength={INVITE_CODE_MAX_LENGTH}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="如有邀请码可填写"
              />
            </label>
            <label>
              <span>密码</span>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={password}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位，含字母和数字`}
              />
            </label>
            <label>
              <span>确认密码</span>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="再次输入密码"
              />
            </label>
            <label className="terms-checkbox-label">
              <input
                checked={acceptedTerms}
                type="checkbox"
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                我已阅读并同意 <Link href="/terms">用户协议</Link> 和{" "}
                <Link href="/privacy">隐私政策</Link>。
              </span>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="auth-actions">
              <button
                className="button-secondary"
                disabled={pending}
                type="button"
                onClick={() => setStep(1)}
              >
                返回改邮箱
              </button>
              <button
                className="button-primary"
                disabled={pending}
                type="submit"
              >
                {pending ? "创建中…" : "创建账号"}
              </button>
            </div>
          </form>
        )}

        <p className="auth-hint">
          已有账号？<Link href={loginHref}>立即登录</Link>
        </p>
      </section>
      <div className="auth-grass-line" aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
