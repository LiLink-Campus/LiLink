"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ActionGroup } from "@/components/semantic";
import {
  Button,
  Field,
  FormMessage,
  Input,
} from "@/components/ui";
import { fetchApi, isApiRequestError } from "../../lib/api";
import {
  extractEmailDomain,
  fetchEligibleSchools,
  findMatchingSchool,
  type EligibleSchoolsPayload,
} from "../../lib/eligible-schools";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";
import authStyles from "../auth.module.css";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REGISTER_REFERRAL_CODE_MAX_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_CODE_LENGTH,
  type CodeResponse,
} from "./constants";
import { RegisterShell } from "./register-shell";
import { SchoolListRetry } from "./school-list-retry";
import { useReferralAttribution } from "./use-referral-attribution";
import { loginHrefFromSearch, registerPathFromSearch } from "./utils";

export default function RegisterSchoolClient() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [schoolsPayload, setSchoolsPayload] =
    useState<EligibleSchoolsPayload | null>(null);
  const [schoolsPending, setSchoolsPending] = useState(false);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [canRevealDevCode, setCanRevealDevCode] = useState(false);
  const [loginHref, setLoginHref] = useState("/login");
  const [chooserHref, setChooserHref] = useState("/register");
  const [personalHref, setPersonalHref] = useState("/register/personal");
  const {
    referralCode,
    setReferralCode,
    referralChannel,
    campaignSlug,
    attributionLocked,
  } = useReferralAttribution();

  const eligibleSchools = useMemo(
    () => schoolsPayload?.schools ?? [],
    [schoolsPayload],
  );
  const schoolsListReady = eligibleSchools.length > 0;
  const matchedSchool = useMemo(
    () => findMatchingSchool(eligibleSchools, email),
    [eligibleSchools, email],
  );
  const emailDomainHint = useMemo(() => extractEmailDomain(email), [email]);

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
    const search = window.location.search;
    setLoginHref(loginHrefFromSearch(search));
    setChooserHref(registerPathFromSearch(search, "/register"));
    setPersonalHref(registerPathFromSearch(search, "/register/personal"));
  }, []);

  const loadEligibleSchools = useCallback(async () => {
    setSchoolsPending(true);
    setSchoolsError(null);
    try {
      const payload = await fetchEligibleSchools();
      setSchoolsPayload(payload);
    } catch (caughtError) {
      setSchoolsError(
        caughtError instanceof Error
          ? caughtError.message
          : "学校列表加载失败，请稍后重试。",
      );
    } finally {
      setSchoolsPending(false);
    }
  }, []);

  useEffect(() => {
    void loadEligibleSchools();
  }, [loadEligibleSchools]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (resendCooldown > 0) return;

    if (schoolsListReady && emailDomainHint && !matchedSchool) {
      setError("该邮箱后缀不在合作学校白名单内。请改用普通邮箱注册。");
      return;
    }

    setPending(true);

    try {
      const result = await fetchApi<CodeResponse>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      if (
        result.registrationMode === "NON_EDU_REFERRAL_REQUIRED" ||
        !result.school
      ) {
        setError("该邮箱无法按学校邮箱注册。请改用普通邮箱注册。");
        return;
      }

      setDevCode(result.devCode);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep(2);
    } catch (caughtError) {
      if (isApiRequestError(caughtError) && caughtError.status === 429) {
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        setError(
          `同一邮箱每 ${RESEND_COOLDOWN_SECONDS} 秒只能获取一次验证码，请稍后再试。`,
        );
      } else {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "验证码发送失败，请稍后再试。",
        );
      }
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

    const trimmedReferralCode = referralCode.trim();
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
          referralCode: trimmedReferralCode || undefined,
          channel: referralChannel || undefined,
          campaignSlug: campaignSlug || undefined,
        }),
      });

      document.cookie = "lilink_ref=; path=/; max-age=0; samesite=lax";

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
    <RegisterShell
      eyebrow={`Register · 学校邮箱 · Step ${step} / 2`}
      title={step === 1 ? "验证学校邮箱" : "完善你的账号"}
      description={
        step === 1
          ? "填写合作高校邮箱，系统会自动识别学校并发送验证码。"
          : "设置昵称和密码，准备好就可以参加下一轮匹配。"
      }
      loginHref={loginHref}
      backHref={step === 1 ? chooserHref : undefined}
    >
      {step === 1 ? (
        <form className={authStyles.stack} onSubmit={requestCode}>
          <Field
            label="学校邮箱"
            hint="请使用 @fudan.edu.cn、@sjtu.edu.cn 等合作高校后缀。"
          >
            <Input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setResendCooldown(0);
              }}
              placeholder="name@school.edu.cn"
            />
          </Field>
          {schoolsPayload ? (
            <EligibleSchoolsPanel
              emailInput={email}
              variant="compact"
              initialPayload={schoolsPayload}
              defaultExpanded
            />
          ) : null}
          {schoolsError ? (
            <SchoolListRetry
              message={schoolsError}
              pending={schoolsPending}
              onRetry={() => void loadEligibleSchools()}
            />
          ) : null}
          {matchedSchool ? (
            <FormMessage tone="success">
              已识别：{matchedSchool.school.name}（@
              {matchedSchool.matchedDomain}）
            </FormMessage>
          ) : null}
          {error ? <FormMessage>{error}</FormMessage> : null}
          {error && emailDomainHint && !matchedSchool && schoolsListReady ? (
            <p className={authStyles.inlineSwitchHint}>
              不是学校邮箱？
              {" "}
              <Link href={personalHref}>改用普通邮箱注册</Link>
            </p>
          ) : null}
          <Button
            block
            disabled={pending || resendCooldown > 0}
            type="submit"
          >
            {pending
              ? "发送中…"
              : resendCooldown > 0
                ? `重新发送（${resendCooldown}s）`
                : "发送验证码"}
          </Button>
          <p className={authStyles.hint}>
            没找到你的学校？前往{" "}
            <Link href="/schools">完整学校列表</Link>{" "}
            查看，或在页脚联系我们补录。
          </p>
        </form>
      ) : (
        <form className={authStyles.stack} onSubmit={register}>
          <div className={authStyles.devInline}>
            <span>已发送到</span>
            <strong>{email}</strong>
          </div>
          <p className={authStyles.hint}>
            几分钟内仍未收到？请检查「垃圾邮件」文件夹，部分学校邮箱会拦截首次发件人。
          </p>
          {canRevealDevCode && devCode ? (
            <p className={authStyles.devNote}>开发环境验证码：{devCode}</p>
          ) : null}
          <Field label="验证码">
            <Input
              required
              value={code}
              maxLength={VERIFICATION_CODE_LENGTH}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(event) => setCode(event.target.value)}
              placeholder="6 位验证码"
            />
          </Field>
          <Field label="显示昵称">
            <Input
              required
              value={displayName}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="别人会先看到这个昵称"
            />
          </Field>
          <Field label="真实姓名（可选）">
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="可留空；仅在必要场景用于核验"
            />
          </Field>
          <Field
            label="邀请码（可选）"
            hint={attributionLocked ? "已通过邀请链接带入，不可修改。" : undefined}
          >
            <Input
              readOnly={attributionLocked}
              value={referralCode}
              maxLength={REGISTER_REFERRAL_CODE_MAX_LENGTH}
              onChange={(event) => setReferralCode(event.target.value)}
              placeholder={
                attributionLocked ? undefined : "如有邀请码可填写"
              }
            />
          </Field>
          <Field label="密码">
            <Input
              required
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位，含字母和数字`}
            />
          </Field>
          <Field label="确认密码">
            <Input
              required
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              placeholder="再次输入密码"
            />
          </Field>
          <label className={authStyles.termsCheckboxLabel}>
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
          {error ? <FormMessage>{error}</FormMessage> : null}
          <ActionGroup className={authStyles.actions}>
            <Button
              variant="secondary"
              disabled={pending}
              type="button"
              onClick={() => setStep(1)}
            >
              返回改邮箱
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "创建中…" : "创建账号"}
            </Button>
          </ActionGroup>
        </form>
      )}
    </RegisterShell>
  );
}
