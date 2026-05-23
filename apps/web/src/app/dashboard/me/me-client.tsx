"use client";

import Link from "next/link";
import { ArrowRightIcon, ClipboardIcon, SparklesIcon } from "../_components/icons";
import { GrassRowIllustration } from "../_components/illustrations";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import type { AuthMePayload } from "../../../lib/api";
import {
  hardMatchFormFromAnswers,
  type HardMatchSchoolOption,
} from "../../../lib/hard-match";
import type { ContactPreferencesPayload, SavedQuestionnairePayload } from "../_lib/types";

export function MeClient({
  initialUser,
  initialSavedQuestionnaire,
  initialContactPreferences,
  initialQuestionnaireSchools,
}: {
  initialUser: AuthMePayload;
  initialSavedQuestionnaire: SavedQuestionnairePayload;
  initialContactPreferences: ContactPreferencesPayload;
  initialQuestionnaireSchools: HardMatchSchoolOption[];
}) {
  useDashboardSessionSeed(initialUser);

  const initial =
    Array.from(initialUser.displayName?.trim() ?? initialUser.email)[0]?.toUpperCase() ?? "NL";

  const displayName = initialUser.displayName?.trim() ?? "";
  const submittedHardMatchForm = hardMatchFormFromAnswers(
    initialSavedQuestionnaire?.answers,
    initialQuestionnaireSchools,
  );
  const oneLinerIntro = submittedHardMatchForm.oneLinerIntro;

  // Find preferred contact method
  const preferredChannel = initialContactPreferences.preferredContactChannel;
  let contactDisplay = `${initialUser.email} (邮箱)`;

  if (preferredChannel === "WECHAT") {
    const wechat = initialContactPreferences.methods.find((m) => m.type === "WECHAT")?.value;
    if (wechat) contactDisplay = `${wechat} (微信)`;
  } else if (preferredChannel === "PHONE") {
    const phone = initialContactPreferences.methods.find((m) => m.type === "PHONE")?.value;
    if (phone) contactDisplay = `${phone} (手机)`;
  } else if (preferredChannel === "QQ") {
    const qq = initialContactPreferences.methods.find((m) => m.type === "QQ")?.value;
    if (qq) contactDisplay = `${qq} (QQ)`;
  }

  return (
    <div className="app-page-shell v2-page-shell me-page">
      <header className="me-hero">
        <span className="me-hero-avatar" aria-hidden="true">
          {initial}
        </span>
        <h1 className="me-hero-name">
          {initialUser.displayName?.trim() || "未命名同学"}
        </h1>
        <p className="me-hero-email">{initialUser.email}</p>
      </header>

      <div className="me-group">
        <div className="me-card-preview">
          <div className="me-card-preview-header">
            <h3>我的引荐名片</h3>
            <p>匹配成功后，TA 看到的就是这张名片</p>
          </div>
          <div className="me-card-preview-content">
             <div className="me-card-field">
                <span className="me-card-label">昵称</span>
                <span className="me-card-value">{displayName || "未填写"}</span>
             </div>
             <div className="me-card-field">
                <span className="me-card-label">一句话介绍</span>
                <span className="me-card-value">{oneLinerIntro || "未填写"}</span>
             </div>
             <div className="me-card-field">
                <span className="me-card-label">首选联系方式</span>
                <span className="me-card-value">{contactDisplay}</span>
             </div>
          </div>
          <Link
            className="me-card-edit-button"
            href="/dashboard/me/card"
            style={{ display: "block", textAlign: "center" }}
          >
            编辑名片
          </Link>
        </div>
      </div>

      <div className="me-shortcut-list">
        <Link href="/dashboard/referrals" className="me-shortcut-card">
          <span className="me-shortcut-icon is-referrals" aria-hidden="true">
            <SparklesIcon />
          </span>
          <span className="me-shortcut-copy">
            <span className="me-shortcut-title">我的邀请</span>
            <span className="me-shortcut-desc">分享链接，邀请同学加入</span>
          </span>
          <ArrowRightIcon className="me-shortcut-arrow" />
        </Link>
        <Link href="/dashboard/coupons" className="me-shortcut-card">
          <span className="me-shortcut-icon is-coupons" aria-hidden="true">
            <ClipboardIcon />
          </span>
          <span className="me-shortcut-copy">
            <span className="me-shortcut-title">我的优惠券</span>
            <span className="me-shortcut-desc">查看可用优惠与核销码</span>
          </span>
          <ArrowRightIcon className="me-shortcut-arrow" />
        </Link>
      </div>

      <div className="me-group">
        <Link href="/forgot-password" className="me-group-row">
          <span className="me-group-row-title">修改密码</span>
          <ArrowRightIcon className="me-group-row-arrow" />
        </Link>
      </div>

      <div className="hub-grass-divider" aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </div>
    </div>
  );
}
