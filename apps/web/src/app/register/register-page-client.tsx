"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";
import { useLocale } from "../locale-context";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 30;
const VERIFICATION_CODE_LENGTH = 6;
const REGISTER_COPY = {
  "zh-CN": {
    sendFallback: "验证码发送失败，请稍后再试。",
    termsRequired: "请先勾选并同意用户协议和隐私政策。",
    passwordTooShort: (min: number) => `密码至少 ${min} 位，请重新输入。`,
    passwordMismatch: "两次输入的密码不一致，请重新确认。",
    registerFallback: "注册失败，请重试。",
    step: (step: number) => `Register · Step ${step} / 2`,
    titleOne: "先验证身份",
    titleTwo: "完善你的账号",
    introOne: "LiLink 仅接受合作高校的学校邮箱。输入邮箱，我们来验证你的身份。",
    introTwo: "设置一个昵称和密码，准备好就可以参加下一轮匹配。",
    email: "学校邮箱",
    recognizedSchool: "已识别学校：",
    sending: "发送中…",
    sendCode: "发送验证码",
    missingSchoolPrefix: "没找到你的学校？前往",
    schools: "完整学校列表",
    missingSchoolSuffix: "查看，或在页脚联系我们补录。",
    sentTo: "已发送到",
    spamHint:
      "几分钟内仍未收到？请检查邮箱的「垃圾邮件」或「拦截邮件」文件夹，部分学校邮箱会自动拦截首次发件人。",
    devCode: "开发环境验证码：",
    code: "验证码",
    codePlaceholder: "6 位验证码",
    displayName: "显示昵称",
    displayNamePlaceholder: "别人会先看到这个昵称",
    fullName: "真实姓名（可选）",
    fullNamePlaceholder: "可留空；仅在必要场景用于核验",
    password: "密码",
    passwordPlaceholder: (min: number) => `至少 ${min} 位，含字母和数字`,
    confirmPassword: "确认密码",
    confirmPasswordPlaceholder: "再次输入密码",
    acceptPrefix: "我已阅读并同意",
    terms: "用户协议",
    and: "和",
    privacy: "隐私政策",
    back: "返回改邮箱",
    creating: "创建中…",
    create: "创建账号",
    loginPrefix: "已有账号？",
    login: "立即登录",
  },
  "en-US": {
    sendFallback: "Verification code could not be sent. Please try again.",
    termsRequired: "Please agree to the Terms and Privacy Policy first.",
    passwordTooShort: (min: number) =>
      `Password must be at least ${min} characters.`,
    passwordMismatch: "The two passwords do not match.",
    registerFallback: "Registration failed. Please try again.",
    step: (step: number) => `Register · Step ${step} / 2`,
    titleOne: "Verify your identity",
    titleTwo: "Finish your account",
    introOne:
      "LiLink only accepts supported school email domains. Enter your email to verify your identity.",
    introTwo:
      "Set a display name and password, then you can join the next matching round.",
    email: "School email",
    recognizedSchool: "Recognized school: ",
    sending: "Sending...",
    sendCode: "Send code",
    missingSchoolPrefix: "Cannot find your school? Check the",
    schools: "full school list",
    missingSchoolSuffix: "or contact us from the footer.",
    sentTo: "Sent to",
    spamHint:
      "Still no email after a few minutes? Check your spam or blocked-mail folder. Some school mail systems block first-time senders.",
    devCode: "Development code: ",
    code: "Code",
    codePlaceholder: "6-digit code",
    displayName: "Display name",
    displayNamePlaceholder: "This is what others will see first",
    fullName: "Real name (optional)",
    fullNamePlaceholder: "Can be left blank; used only when verification is necessary",
    password: "Password",
    passwordPlaceholder: (min: number) =>
      `At least ${min} characters with letters and numbers`,
    confirmPassword: "Confirm password",
    confirmPasswordPlaceholder: "Enter the password again",
    acceptPrefix: "I have read and agree to the",
    terms: "Terms",
    and: "and",
    privacy: "Privacy Policy",
    back: "Change email",
    creating: "Creating...",
    create: "Create account",
    loginPrefix: "Already have an account?",
    login: "Log in",
  },
} as const;

type CodeResponse = {
  email: string;
  expiresAt: string;
  school?: {
    schoolName: string;
    matchedDomain: string;
    schoolNativeName?: string;
    schoolEnglishName?: string;
    schoolBaseName?: string;
  } | null;
  devCode?: string;
};

export default function RegisterPageClient() {
  const { locale } = useLocale();
  const copy = REGISTER_COPY[locale];
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [resolvedSchool, setResolvedSchool] = useState<CodeResponse["school"]>(
    null,
  );
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canRevealDevCode, setCanRevealDevCode] = useState(false);
  const resolvedSchoolSecondary =
    resolvedSchool == null
      ? null
      : locale === "en-US"
        ? resolvedSchool.schoolNativeName
        : resolvedSchool.schoolEnglishName;

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
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
          : copy.sendFallback,
      );
    } finally {
      setPending(false);
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!acceptedTerms) {
      setError(copy.termsRequired);
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(copy.passwordTooShort(PASSWORD_MIN_LENGTH));
      return;
    }

    if (password !== passwordConfirm) {
      setError(copy.passwordMismatch);
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
        }),
      });

      window.location.href = "/dashboard";
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : copy.registerFallback,
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
        <h1>{step === 1 ? copy.titleOne : copy.titleTwo}</h1>
        <p>
          {step === 1
            ? copy.introOne
            : copy.introTwo}
        </p>

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
            <EligibleSchoolsPanel emailInput={email} variant="compact" />
            {resolvedSchool ? (
              <p className="form-success">
                {copy.recognizedSchool}
                {resolvedSchool.schoolName}
                {resolvedSchoolSecondary &&
                resolvedSchoolSecondary !== resolvedSchool.schoolName
                  ? ` · ${resolvedSchoolSecondary}`
                  : ""}
                {locale === "zh-CN"
                  ? `（@${resolvedSchool.matchedDomain}）`
                  : ` (@${resolvedSchool.matchedDomain})`}
              </p>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            <button
              className="button-primary button-block"
              disabled={pending}
              type="submit"
            >
              {pending ? copy.sending : copy.sendCode}
            </button>
            <p className="auth-hint">
              {copy.missingSchoolPrefix}
              {" "}
              <Link href="/schools">{copy.schools}</Link>
              {" "}
              {copy.missingSchoolSuffix}
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={register}>
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
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(event) => setCode(event.target.value)}
                placeholder={copy.codePlaceholder}
              />
            </label>
            <label>
              <span>{copy.displayName}</span>
              <input
                required
                value={displayName}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={copy.displayNamePlaceholder}
              />
            </label>
            <label>
              <span>{copy.fullName}</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={copy.fullNamePlaceholder}
              />
            </label>
            <label>
              <span>{copy.password}</span>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={password}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.passwordPlaceholder(PASSWORD_MIN_LENGTH)}
              />
            </label>
            <label>
              <span>{copy.confirmPassword}</span>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder={copy.confirmPasswordPlaceholder}
              />
            </label>
            <label className="terms-checkbox-label">
              <input
                checked={acceptedTerms}
                type="checkbox"
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                {copy.acceptPrefix} <Link href="/terms">{copy.terms}</Link>{" "}
                {copy.and} <Link href="/privacy">{copy.privacy}</Link>
                {locale === "zh-CN" ? "。" : "."}
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
                {copy.back}
              </button>
              <button
                className="button-primary"
                disabled={pending}
                type="submit"
              >
                {pending ? copy.creating : copy.create}
              </button>
            </div>
          </form>
        )}

        <p className="auth-hint">
          {copy.loginPrefix} <Link href="/login">{copy.login}</Link>
        </p>
      </section>
      <div className="auth-grass-line" aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
