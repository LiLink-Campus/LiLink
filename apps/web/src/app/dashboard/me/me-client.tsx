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

export function MeClient({
  initialUser,
  initialDashboard,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
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
            <h1>{initialUser.displayName?.trim() || "未命名同学"}</h1>
            <p>{initialUser.email}</p>
            <span
              className={
                hasSavedQuestionnaire
                  ? "app-card-status is-on"
                  : "app-card-status is-warn"
              }
            >
              {hasSavedQuestionnaire ? "匹配资料已保存" : "匹配资料待完成"}
            </span>
          </div>
        </div>
      </header>

      <section className="app-card" aria-label="账号与帮助">
        <div className="app-card-head">
          <h2 className="app-card-title">账号与帮助</h2>
        </div>
        <div className="me-card-list">
          <Link href="/dashboard/profile" className="me-row">
            <span className="me-row-text">
              <strong>匹配资料</strong>
              <span>
                {hasSavedQuestionnaire ? "匹配资料已保存" : "匹配资料待完成"}
              </span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/dashboard/referral-settings" className="me-row">
            <span className="me-row-text">
              <strong>引荐设置</strong>
              <span>联系方式与展示渠道</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/about" className="me-row">
            <span className="me-row-text">
              <strong>关于 LiLink</strong>
              <span>校园里的，认真相遇</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/faq" className="me-row">
            <span className="me-row-text">
              <strong>常见问题</strong>
              <span>机制、隐私、举报与联络方式</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/forgot-password" className="me-row">
            <span className="me-row-text">
              <strong>修改密码</strong>
              <span>通过学校邮箱验证码重置</span>
            </span>
            <span className="me-row-arrow" aria-hidden="true">
              <ArrowRightIcon />
            </span>
          </Link>
          <Link href="/terms" className="me-row">
            <span className="me-row-text">
              <strong>用户协议与隐私政策</strong>
              <span>注册时同意的两份文件</span>
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
        {pending ? "退出中…" : "退出登录"}
      </button>

      <div className="hub-grass-divider" aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </div>
    </div>
  );
}
