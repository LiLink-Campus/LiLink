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
  Select,
} from "@/components/ui";
import { fetchApi, isApiRequestError } from "../../lib/api";
import {
  fetchEligibleSchools,
  type EligibleSchoolsPayload,
} from "../../lib/eligible-schools";
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

export default function RegisterPersonalClient() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [manualSchoolId, setManualSchoolId] = useState("");
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
  const [schoolHref, setSchoolHref] = useState("/register/school");
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

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
    const search = window.location.search;
    setLoginHref(loginHrefFromSearch(search));
    setChooserHref(registerPathFromSearch(search, "/register"));
    setSchoolHref(registerPathFromSearch(search, "/register/school"));
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

    const trimmedReferralCode = referralCode.trim();
    if (!trimmedReferralCode) {
      setError("请先填写有效邀请码。");
      return;
    }

    setPending(true);

    try {
      const result = await fetchApi<CodeResponse>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          referralCode: trimmedReferralCode,
        }),
      });

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
    const trimmedManualSchoolId = manualSchoolId.trim();

    if (!trimmedReferralCode) {
      setError("请填写有效邀请码。");
      return;
    }

    if (!trimmedManualSchoolId) {
      setError("请选择你的学校。");
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
          referralCode: trimmedReferralCode,
          manualSchoolId: trimmedManualSchoolId,
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
      eyebrow={`Register · 普通邮箱 · Step ${step} / 2`}
      title={step === 1 ? "验证普通邮箱" : "完善你的账号"}
      description={
        step === 1
          ? "向已注册同学索取 10 位邀请码，填写后即可获取邮箱验证码。"
          : "确认邀请码、选择学校，并设置账号信息。"
      }
      loginHref={loginHref}
      backHref={step === 1 ? chooserHref : undefined}
    >
      {step === 1 ? (
        <form className={authStyles.stack} onSubmit={requestCode}>
          <Field
            label="邀请码"
            hint={
              attributionLocked
                ? "已通过邀请链接带入，不可修改。"
                : "向已经在 LiLink 注册的教育邮箱用户索取。"
            }
          >
            <Input
              required
              readOnly={attributionLocked}
              value={referralCode}
              maxLength={REGISTER_REFERRAL_CODE_MAX_LENGTH}
              onChange={(event) => setReferralCode(event.target.value)}
              placeholder={attributionLocked ? undefined : "请输入 10 位邀请码"}
            />
          </Field>
          <Field
            label="普通邮箱"
            hint="QQ、163、Gmail 等均可。若你有学校邮箱，请改用学校邮箱注册。"
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
              placeholder="your.name@gmail.com"
            />
          </Field>
          {error ? <FormMessage>{error}</FormMessage> : null}
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
            其实有学校邮箱？
            {" "}
            <Link href={schoolHref}>改用学校邮箱注册</Link>
          </p>
        </form>
      ) : (
        <form className={authStyles.stack} onSubmit={register}>
          <div className={authStyles.devInline}>
            <span>已发送到</span>
            <strong>{email}</strong>
          </div>
          <p className={authStyles.hint}>
            几分钟内仍未收到？请检查「垃圾邮件」文件夹。
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
            label="邀请码"
            hint="已在第一步校验，不可修改。如需更换请返回上一步。"
          >
            <Input
              required
              readOnly
              value={referralCode}
              maxLength={REGISTER_REFERRAL_CODE_MAX_LENGTH}
              aria-readonly="true"
            />
          </Field>
          <Field
            label="学校"
            hint="请选择你当前就读或所属的学校。学校选定后无法自行更改，请务必准确选择。"
          >
            <Select
              required
              value={manualSchoolId}
              disabled={schoolsPending || eligibleSchools.length === 0}
              onChange={(event) => setManualSchoolId(event.target.value)}
            >
              <option value="">
                {schoolsPending ? "学校列表加载中..." : "请选择学校"}
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
              返回上一步
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
