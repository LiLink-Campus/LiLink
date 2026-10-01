"use client";

import { dcx } from "../_lib/dashboard-class-names";
import Link from "next/link";
import { useRef } from "react";
import modalStyles from "../_components/HomeOverview.module.css";
import { ArrowRightIcon } from "../_components/icons";
import { GrassRowIllustration } from "../_components/illustrations";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import type { AuthMePayload } from "../../../lib/api";
import {
  type HardMatchSchoolOption,
} from "../../../lib/hard-match";
import type { ContactPreferencesPayload, SavedQuestionnairePayload } from "../_lib/types";

export function MeClient({
  initialUser,
}: {
  initialUser: AuthMePayload;
  initialSavedQuestionnaire: SavedQuestionnairePayload;
  initialContactPreferences: ContactPreferencesPayload;
  initialQuestionnaireSchools: HardMatchSchoolOption[];
}) {
  useDashboardSessionSeed(initialUser);
  const deletionDialog = useRef<HTMLDialogElement>(null);

  const initial =
    Array.from(initialUser.displayName?.trim() ?? initialUser.email)[0]?.toUpperCase() ?? "NL";

  return (
    <div className={dcx("app-page-shell v2-page-shell me-page")}>
      <header className={dcx("me-hero")}>
        <span className={dcx("me-hero-avatar")} aria-hidden="true">
          {initial}
        </span>
        <h1 className={dcx("me-hero-name")}>
          账号设置
        </h1>
        <p className={dcx("me-hero-email")}>{initialUser.email}</p>
      </header>

      <div className={dcx("me-group")}>
        <Link href="/forgot-password" className={dcx("me-group-row")}>
          <span className={dcx("me-group-row-title")}>修改密码</span>
          <ArrowRightIcon className={dcx("me-group-row-arrow")} />
        </Link>
      </div>
      <div className={dcx("me-group")}>
        <button type="button" className={dcx("me-group-row")} style={{width: "100%", textAlign: "left"}} onClick={() => deletionDialog.current?.showModal()}>
          <span className={dcx("me-group-row-title")}>注销账号</span>
          <ArrowRightIcon className={dcx("me-group-row-arrow")} />
        </button>
      </div>
      <dialog ref={deletionDialog} className={modalStyles.dialog} aria-labelledby="delete-account-title">
        <button className={modalStyles.close} aria-label="关闭" onClick={() => deletionDialog.current?.close()}>×</button>
        <h2 id="delete-account-title">注销账号</h2>
        <p>注销后，这个账号将被永久删除，无法恢复，也无法再登录或参加匹配。</p>
        <p>你可以使用原邮箱重新注册，但新账号不会恢复原账号的资料和匹配记录。</p><p>当前为视觉预览，尚未接入真实注销，不会删除任何数据。</p>
        <button className={modalStyles.primary} onClick={() => deletionDialog.current?.close()}>暂不注销，返回</button>
      </dialog>

      <div className={dcx("hub-grass-divider")} aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
        <GrassRowIllustration />
      </div>
    </div>
  );
}
