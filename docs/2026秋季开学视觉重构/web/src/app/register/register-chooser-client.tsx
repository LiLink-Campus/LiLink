"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReferralAttribution } from "./use-referral-attribution";
import { RegisterShell } from "./register-shell";
import { loginHrefFromSearch, registerPathFromSearch } from "./utils";
import authStyles from "../auth.module.css";
import styles from "./register-chooser.module.css";

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
      eyebrow=""
      className={styles.panel}
      title="加入 LiLink"
      description="选择你的注册邮箱"
      loginHref={loginHref}
    >
      <div className={styles.choices}>
        <Link href={schoolHref} className={styles.choice}>
          <span className={styles.choiceHeading}>
            <strong>学校邮箱</strong><span className={styles.badge}>免邀请码</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
          </span>
          <p>使用合作高校邮箱，自动识别学校。</p>
        </Link>

        <Link href={personalHref} className={styles.choice}>
          <span className={styles.choiceHeading}>
            <strong>普通邮箱</strong><span className={styles.badgeMuted}>需邀请码</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
          </span>
          <p>支持 QQ、163、Gmail 等，凭同学邀请码注册。</p>
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
