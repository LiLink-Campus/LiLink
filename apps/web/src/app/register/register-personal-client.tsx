"use client";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { InteractiveFields } from "@/components/interactive-fields";
import { ActionGroup } from "@/components/semantic";
import {
  Button,
  Field,
  FormMessage,
  Input,
  Select,
} from "@/components/ui";
import { fetchApi, isApiRequestError } from "../../lib/api";
import authStyles from "../auth.module.css";
import flowStyles from "./register-flow.module.css";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_CODE_LENGTH,
  type CodeResponse,
} from "./constants";
import { RegistrationLegalLinks } from "./registration-legal-links";
import { RegisterShell } from "./register-shell";
import { SchoolListRetry } from "./school-list-retry";
import { useRegistrationSchools } from "./use-registration-schools";
import { useReferralAttribution } from "./use-referral-attribution";
import { loginHrefFromSearch, registerPathFromSearch } from "./utils";

export default function RegisterPersonalClient() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [manualSchoolId, setManualSchoolId] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const {
    payload: schoolsPayload,
    pending: schoolsPending,
    error: schoolsError,
    reload: loadEligibleSchools,
  } = useRegistrationSchools();
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [canRevealDevCode, setCanRevealDevCode] = useState(false);
  const [loginHref, setLoginHref] = useState("/login");
  const [chooserHref, setChooserHref] = useState("/register");
  const {
    referralCode,
    referralChannel,
    campaignSlug,
  } = useReferralAttribution();

  const eligibleSchools = useMemo(
    () => schoolsPayload?.schools ?? [],
    [schoolsPayload],
  );

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
    const search = window.location.search;
    setLoginHref(loginHrefFromSearch(search));
    setChooserHref(registerPathFromSearch(search, "/register"));
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function requestCode(event: { preventDefault: () => void }) {
    event.preventDefault();
    setError(null);

    if (resendCooldown > 0) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("请先填写有效邮箱。"); return;
    }

    setPending(true);

    try {
      const result = await fetchApi<CodeResponse>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          referralCode: referralCode.trim() || undefined,
        }),
      });

      setDevCode(result.devCode);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setCodeSent(true);
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

  function continueRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!codeSent || !/^\d{6}$/.test(code))) {
      setError("请获取并填写 6 位邮箱验证码。"); return;
    }
    setError(null); setStep(2); void loadEligibleSchools(); window.scrollTo({ top: 0 });
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
    const trimmedManualSchoolId = manualSchoolId.trim();

    if (trimmedManualSchoolId && !eligibleSchools.some(school => school.id === trimmedManualSchoolId)) {
      setError("请选择有效学校或暂不填写。");
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
          acceptedTerms,
          referralCode: trimmedReferralCode || undefined,
          manualSchoolId: trimmedManualSchoolId || undefined,
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
      if (caughtError instanceof Error && caughtError.message.includes("验证码")) setStep(1);
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
      eyebrow="普通邮箱注册"
      step={step}
      title={step === 1 ? "验证普通邮箱" : "完善你的账号"}
      description={
        step === 1
          ? null
          : "设置密码即可加入，学校与昵称可在登录后完善。"
      }
      loginHref={loginHref}
      backHref={step === 1 ? chooserHref : undefined}
    >
      <InteractiveFields>
        {step === 1 ? (
          <form className={authStyles.stack} onSubmit={continueRegistration}>
            <Field
              label="普通邮箱"
            >
              <Input
                required
                type="email"
                disabled={pending}
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setCode("");
                  setCodeSent(false);
                }}
                placeholder="your.name@gmail.com"
              />
            </Field>
            {error ? <FormMessage>{error}</FormMessage> : null}
            <div className={flowStyles.codeRow}>
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
            <Button
              variant="secondary"
              disabled={pending || resendCooldown > 0}
              type="button"
              onClick={(event) => void requestCode(event)}
            >
              {pending
                ? "发送中…"
                : resendCooldown > 0
                  ? `${resendCooldown}s 后重发`
                  : "发送验证码"}
            </Button>
            </div>
            {codeSent ? <p className={flowStyles.delivery} role="status">验证码已发送，请检查收件箱或垃圾邮件。</p> : null}
            {canRevealDevCode && devCode ? <p className={authStyles.devNote}>开发环境验证码：{devCode}</p> : null}
            <Button block type="submit" disabled={pending}>下一步</Button>
          </form>
        ) : (
          <form className={authStyles.stack} onSubmit={register}>
            <Field
              label="学校"
              hint="可暂不填写。选择学校不代表通过教育认证，登录后可通过邀请码或教育邮箱认证。"
            >
              <Select
                className={flowStyles.schoolSelect}
                value={eligibleSchools.some((school) => school.id === manualSchoolId) ? manualSchoolId : ""}
                disabled={schoolsPending || eligibleSchools.length === 0}
                onChange={(event) => setManualSchoolId(event.target.value)}
              >
                <option value="">
                  {schoolsPending ? "学校列表加载中..." : "非在校／暂不填写"}
                </option>
                {eligibleSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>
            {schoolsError || (!schoolsPending && eligibleSchools.length === 0) ? (
              <SchoolListRetry
                message={schoolsError ?? "暂时没有可选的学校，请稍后重试。"}
                pending={schoolsPending}
                onRetry={() => void loadEligibleSchools()}
              />
            ) : null}
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
            <label className={`${authStyles.termsCheckboxLabel} ${flowStyles.termsRow}`}>
              <input
                checked={acceptedTerms}
                type="checkbox"
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                我已阅读并同意 <RegistrationLegalLinks />。
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
                返回上一步
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "创建中…" : "创建账号"}
              </Button>
            </ActionGroup>
          </form>
        )}
      </InteractiveFields>
    </RegisterShell>
  );
}
