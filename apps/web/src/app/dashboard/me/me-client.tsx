"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchApi, type AuthMePayload } from "../../../lib/api";
import { useAuthSession } from "../../auth-session";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { ArrowRightIcon, LogoutIcon } from "../_components/icons";
import { GrassRowIllustration } from "../_components/illustrations";
import type { DashboardPayload } from "../_lib/types";
import { useLocale } from "../../locale-context";

export function MeClient({
  initialUser,
  initialDashboard,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  const { locale } = useLocale();
  const copy =
    locale === "zh-CN"
      ? {
          unnamed: "未命名同学",
          saved: "问卷已保存",
          pending: "问卷待完成",
          accountHelp: "账号与帮助",
          aboutTitle: "关于 LiLink",
          aboutSub: "校园里的，认真相遇",
          faqTitle: "常见问题",
          faqSub: "机制、隐私、举报与联络方式",
          passwordTitle: "修改密码",
          passwordSub: "通过学校邮箱验证码重置",
          termsTitle: "用户协议与隐私政策",
          termsSub: "注册时同意的两份文件",
          loggingOut: "退出中…",
          logout: "退出登录",
          grass: "好的关系，源于尊重与真诚",
        }
      : {
          unnamed: "Unnamed student",
          saved: "Questionnaire saved",
          pending: "Questionnaire incomplete",
          accountHelp: "Account and help",
          aboutTitle: "About LiLink",
          aboutSub: "Intentional campus matching",
          faqTitle: "FAQ",
          faqSub: "Mechanism, privacy, reports, and contact",
          passwordTitle: "Change password",
          passwordSub: "Reset by school email code",
          termsTitle: "Terms and Privacy Policy",
          termsSub: "The documents agreed to at registration",
          loggingOut: "Logging out...",
          logout: "Log out",
          grass: "Good relationships start with respect and sincerity",
        };
  const router = useRouter();
  useDashboardSessionSeed(initialUser);
  const { setUser } = useAuthSession();
  const [pending, setPending] = useState(false);
  const hasSavedQuestionnaire = Boolean(
    initialDashboard.questionnaireSubmittedAt,
  );
  const initial =
    Array.from(initialUser.displayName?.trim() ?? initialUser.email)[0]?.toUpperCase() ??
    "NL";

  async function handleLogout() {
    setPending(true);
    try {
      await fetchApi("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="app-page-shell">
      <header className="app-page-header me-page-header">
        <div className="me-identity">
          <span className="me-avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="me-identity-text">
            <p className="eyebrow">My Account</p>
            <h1>{initialUser.displayName?.trim() || copy.unnamed}</h1>
            <p>{initialUser.email}</p>
            <span
              className={
                hasSavedQuestionnaire
                  ? "app-card-status is-on"
                  : "app-card-status is-warn"
              }
            >
              {hasSavedQuestionnaire ? copy.saved : copy.pending}
            </span>
          </div>
        </div>
      </header>

      <section className="app-card" aria-label={copy.accountHelp}>
        <div className="app-card-head">
          <h2 className="app-card-title">{copy.accountHelp}</h2>
        </div>
        <div className="me-card-list">
          <Link href="/about" className="me-row">
            <span className="me-row-text">
              <strong>{copy.aboutTitle}</strong>
              <span>{copy.aboutSub}</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/faq" className="me-row">
            <span className="me-row-text">
              <strong>{copy.faqTitle}</strong>
              <span>{copy.faqSub}</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/forgot-password" className="me-row">
            <span className="me-row-text">
              <strong>{copy.passwordTitle}</strong>
              <span>{copy.passwordSub}</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/terms" className="me-row">
            <span className="me-row-text">
              <strong>{copy.termsTitle}</strong>
              <span>{copy.termsSub}</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
        </div>
      </section>

      <button
        type="button"
        className="button-ghost button-block"
        disabled={pending}
        onClick={() => void handleLogout()}
      >
        <LogoutIcon />
        {pending ? copy.loggingOut : copy.logout}
      </button>

      <div className="hub-grass-divider" aria-hidden="true">
        <GrassRowIllustration />
        <span>{copy.grass}</span>
        <GrassRowIllustration />
      </div>
    </div>
  );
}
