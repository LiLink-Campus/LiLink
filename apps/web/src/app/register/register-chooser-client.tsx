"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReferralAttribution } from "./use-referral-attribution";
import { RegisterShell } from "./register-shell";
import { loginHrefFromSearch, registerPathFromSearch } from "./utils";
import authStyles from "../auth.module.css";

export default function RegisterChooserClient() {
  const [loginHref, setLoginHref] = useState("/login");
  const [schoolHref, setSchoolHref] = useState("/register/school");
  const [personalHref, setPersonalHref] = useState("/register/personal");
  const { hasReferralCookie } = useReferralAttribution();

  useEffect(() => {
    const search = window.location.search;
    setLoginHref(loginHrefFromSearch(search));
    setSchoolHref(registerPathFromSearch(search, "/register/school"));
    setPersonalHref(registerPathFromSearch(search, "/register/personal"));
  }, []);

  return (
    <RegisterShell
      eyebrow="Register"
      title="你想用哪种邮箱注册？"
      description="先选择邮箱类型，我们会带你进入对应的注册流程。"
      loginHref={loginHref}
    >
      <div className={authStyles.pathChooser}>
        <Link href={schoolHref} className={authStyles.pathChoice}>
          <span className={authStyles.pathChoiceBadge}>推荐</span>
          <strong className={authStyles.pathChoiceTitle}>学校邮箱</strong>
          <p className={authStyles.pathChoiceDesc}>
            使用合作高校邮箱后缀注册，免邀请码，系统自动识别学校。
          </p>
          <span className={authStyles.pathChoiceAction}>继续注册 →</span>
        </Link>

        <Link href={personalHref} className={authStyles.pathChoice}>
          <span
            className={`${authStyles.pathChoiceBadge} ${authStyles.pathChoiceBadgeMuted}`}
          >
            需邀请码
          </span>
          <strong className={authStyles.pathChoiceTitle}>普通邮箱</strong>
          <p className={authStyles.pathChoiceDesc}>
            使用 QQ、163、Gmail 等邮箱，需向已注册同学索取邀请码，并手动选择学校。
          </p>
          <span className={authStyles.pathChoiceAction}>继续注册 →</span>
        </Link>
      </div>

      {hasReferralCookie ? (
        <p className={authStyles.pathChooserNote}>
          检测到邀请链接，建议选择「普通邮箱」继续。
        </p>
      ) : null}
    </RegisterShell>
  );
}
