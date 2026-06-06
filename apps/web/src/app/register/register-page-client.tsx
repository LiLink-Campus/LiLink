"use client";

import {
  PERSONAL_CODE_LENGTH,
  REFERRAL_CHANNELS,
  sanitizeSameOriginRelativePath,
} from "@lilink/shared";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ActionGroup } from "@/components/semantic";
import {
  Button,
  Card,
  Field,
  FormMessage,
  Input,
  Select,
} from "@/components/ui";
import { fetchApi } from "../../lib/api";
import {
  extractEmailDomain,
  fetchEligibleSchools,
  isEmailMatchedByRegistrationAllowlist,
  type EligibleSchool,
} from "../../lib/eligible-schools";
import {
  GrassRowIllustration,
  OliveSprigIllustration,
} from "../dashboard/_components/illustrations";
import { EligibleSchoolsPanel } from "../eligible-schools-panel";
import authStyles from "../auth.module.css";
import layoutStyles from "../public-layout.module.css";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 30;
const VERIFICATION_CODE_LENGTH = 6;
const REGISTER_REFERRAL_CODE_MAX_LENGTH = 64;

type RegistrationMode = "SCHOOL_EMAIL" | "NON_EDU_REFERRAL_REQUIRED";

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
    schoolId: string;
    schoolName: string;
    matchedDomain: string;
  } | null;
  registrationMode?: RegistrationMode;
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
  const [referralCode, setReferralCode] = useState("");
  const [referralChannel, setReferralChannel] = useState("");
  const [attributionLocked, setAttributionLocked] = useState(false);
  const [campaignSlug, setCampaignSlug] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [resolvedSchool, setResolvedSchool] = useState<CodeResponse["school"]>(
    null,
  );
  const [requiresNonEduReferral, setRequiresNonEduReferral] = useState(false);
  const [manualSchoolId, setManualSchoolId] = useState("");
  const [eligibleSchools, setEligibleSchools] = useState<EligibleSchool[]>([]);
  const [schoolsPending, setSchoolsPending] = useState(false);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [canRevealDevCode, setCanRevealDevCode] = useState(false);
  const [loginHref, setLoginHref] = useState("/login");
  const emailDomainHint = useMemo(() => extractEmailDomain(email), [email]);
  const requiresReferralBeforeCode = useMemo(
    () =>
      Boolean(
        emailDomainHint && !isEmailMatchedByRegistrationAllowlist(email),
      ),
    [email, emailDomainHint],
  );

  useEffect(() => {
    const localhostHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    setCanRevealDevCode(localhostHosts.has(window.location.hostname));
    setLoginHref(loginHrefFromSearch(window.location.search));

    // Read referral attribution stashed by the /i/[code] landing page.
    const refCookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("lilink_ref="));
    if (!refCookie) return;
    try {
      const parsed = JSON.parse(
        decodeURIComponent(refCookie.slice("lilink_ref=".length)),
      ) as { code?: unknown; channel?: unknown; campaignSlug?: unknown };
      const refCode = typeof parsed.code === "string" ? parsed.code : "";
      if (refCode.length === PERSONAL_CODE_LENGTH) {
        setReferralCode(refCode);
        setAttributionLocked(true);
      }
      if (
        typeof parsed.channel === "string" &&
        (REFERRAL_CHANNELS as readonly string[]).includes(parsed.channel)
      ) {
        setReferralChannel(parsed.channel);
      }
      if (
        typeof parsed.campaignSlug === "string" &&
        /^[a-z0-9][a-z0-9-]{0,63}$/.test(parsed.campaignSlug)
      ) {
        setCampaignSlug(parsed.campaignSlug);
      }
    } catch {
      // Ignore a malformed referral cookie.
    }
  }, []);

  useEffect(() => {
    if (!requiresNonEduReferral) {
      setManualSchoolId("");
      setSchoolsError(null);
      setSchoolsPending(false);
      return;
    }

    if (eligibleSchools.length > 0) {
      return;
    }

    let active = true;
    setSchoolsPending(true);
    setSchoolsError(null);

    fetchEligibleSchools()
      .then((payload) => {
        if (active) {
          setEligibleSchools(payload.schools);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setSchoolsError(
            caughtError instanceof Error
              ? caughtError.message
              : "学校列表加载失败，请稍后重试。",
          );
        }
      })
      .finally(() => {
        if (active) {
          setSchoolsPending(false);
        }
      });

    return () => {
      active = false;
    };
  }, [eligibleSchools.length, requiresNonEduReferral]);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedReferralCode = referralCode.trim();
    if (requiresReferralBeforeCode && !trimmedReferralCode) {
      setError("普通邮箱获取验证码前，请先填写有效邀请码。");
      return;
    }

    setPending(true);

    try {
      const result = await fetchApi<CodeResponse>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({
          email,
          referralCode: trimmedReferralCode || undefined,
        }),
      });
      const requiresReferral =
        result.registrationMode === "NON_EDU_REFERRAL_REQUIRED" ||
        !result.school;

      setResolvedSchool(result.school ?? null);
      setRequiresNonEduReferral(requiresReferral);
      if (!requiresReferral) {
        setManualSchoolId("");
      }
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

    const trimmedReferralCode = referralCode.trim();
    const trimmedManualSchoolId = manualSchoolId.trim();

    if (requiresNonEduReferral && !trimmedReferralCode) {
      setError("检测到非教育邮箱，请填写有效邀请码。");
      return;
    }

    if (requiresNonEduReferral && !trimmedManualSchoolId) {
      setError("检测到非教育邮箱，请选择你的学校。");
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
          referralCode: trimmedReferralCode || undefined,
          manualSchoolId: requiresNonEduReferral
            ? trimmedManualSchoolId
            : undefined,
          channel: referralChannel || undefined,
          campaignSlug: campaignSlug || undefined,
        }),

      });

      // Attribution has been consumed; clear the landing cookie.
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
    <main
      className={`${layoutStyles.pageShell} ${layoutStyles.proseShell} ${authStyles.shell}`}
    >
      <Card className={`${authStyles.panel} animate-in`} layout="plain">
        <div className={authStyles.panelMark} aria-hidden="true">
          <OliveSprigIllustration />
        </div>
        <p className="eyebrow">Register · Step {step} / 2</p>
        <h1>{step === 1 ? "先验证身份" : "完善你的账号"}</h1>
        <p>
          {step === 1
            ? "LiLink 推荐使用合作高校的学校邮箱注册以自动激活。若使用普通邮箱注册，后续步骤必须填写有效邀请码并手动选择你所在的学校。"
            : "设置一个昵称和密码，准备好就可以参加下一轮匹配。"}
        </p>

        {step === 1 ? (
          <form className={authStyles.stack} onSubmit={requestCode}>
            <Field label="邮箱">
              <Input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setResolvedSchool(null);
                  setRequiresNonEduReferral(false);
                  setManualSchoolId("");
                }}
                placeholder="your.name@example.com"
              />
            </Field>
            <EligibleSchoolsPanel emailInput={email} variant="compact" />
            {requiresReferralBeforeCode ? (
              <Field
                label="邀请码（获取验证码前必填）"
                hint="普通邮箱需要先通过邀请码校验，校验通过后才会发送验证码。"
              >
                <Input
                  required
                  readOnly={attributionLocked}
                  value={referralCode}
                  maxLength={REGISTER_REFERRAL_CODE_MAX_LENGTH}
                  onChange={(event) => setReferralCode(event.target.value)}
                  placeholder={
                    attributionLocked
                      ? undefined
                      : "请输入邀请人的 10 位邀请码"
                  }
                />
              </Field>
            ) : null}
            {resolvedSchool ? (
              <FormMessage tone="success">
                已识别学校：{resolvedSchool.schoolName}（@
                {resolvedSchool.matchedDomain}）
              </FormMessage>
            ) : null}
            {error ? <FormMessage>{error}</FormMessage> : null}
            <Button
              block
              disabled={pending}
              type="submit"
            >
              {pending ? "发送中…" : "发送验证码"}
            </Button>
            <p className={authStyles.hint}>
              没找到你的学校？前往
              {" "}
              <Link href="/schools">完整学校列表</Link>
              {" "}
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
              几分钟内仍未收到？请检查邮箱的「垃圾邮件」或「拦截邮件」文件夹，部分学校邮箱会自动拦截首次发件人。
            </p>
            {canRevealDevCode && devCode ? (
              <p className={authStyles.devNote}>开发环境验证码：{devCode}</p>
            ) : null}
            {requiresNonEduReferral ? (
              <FormMessage tone="success">
                检测到非教育邮箱，后续步骤必须填写有效邀请码，并选择你的学校。
              </FormMessage>
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
              label={
                requiresNonEduReferral
                  ? "邀请码（必填）"
                  : attributionLocked
                    ? "邀请码"
                    : "邀请码（可选）"
              }
              hint={
                attributionLocked
                  ? "已通过邀请链接带入，不可修改。"
                  : requiresNonEduReferral
                    ? "请填写邀请人的 10 位邀请码。"
                    : undefined
              }
            >
              <Input
                required={requiresNonEduReferral}
                readOnly={attributionLocked}
                value={referralCode}
                maxLength={REGISTER_REFERRAL_CODE_MAX_LENGTH}
                onChange={(event) => setReferralCode(event.target.value)}
                placeholder={
                  attributionLocked
                    ? undefined
                    : requiresNonEduReferral
                      ? "请输入邀请人的 10 位邀请码"
                      : "如有邀请码可填写"
                }
              />
            </Field>
            {requiresNonEduReferral ? (
              <>
                <Field
                  label="学校（必填）"
                  hint="请选择你当前就读或所属的学校，用于后续资料与匹配配置。"
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
                <p className={authStyles.schoolLockWarning}>
                  ⚠️ 注意：学校一旦在注册时选定，后续将作为身份凭证，无法自行更改，请务必准确选择。
                </p>
                {schoolsError ? (
                  <FormMessage>{schoolsError}</FormMessage>
                ) : null}
              </>
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
                返回改邮箱
              </Button>
              <Button
                disabled={pending}
                type="submit"
              >
                {pending ? "创建中…" : "创建账号"}
              </Button>
            </ActionGroup>
          </form>
        )}

        <p className={authStyles.hint}>
          已有账号？<Link href={loginHref}>立即登录</Link>
        </p>
      </Card>
      <div className={authStyles.grassLine} aria-hidden="true">
        <GrassRowIllustration />
      </div>
    </main>
  );
}
