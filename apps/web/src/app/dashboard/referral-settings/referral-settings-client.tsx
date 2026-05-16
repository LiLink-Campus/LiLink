"use client";

import { type AuthMePayload } from "../../../lib/api";
import { ContactPreferencesEditor } from "../_components/ContactPreferencesEditor";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import type { ContactPreferencesPayload } from "../_lib/types";

export function ReferralSettingsClient({
  initialUser,
  initialContactPreferences,
}: {
  initialUser: AuthMePayload;
  initialContactPreferences: ContactPreferencesPayload;
}) {
  useDashboardSessionSeed(initialUser);

  return (
    <div className="app-page-shell app-page-shell-narrow">
      <header className="app-page-header referral-settings-header">
        <p className="eyebrow">Introduction Settings</p>
        <h1>引荐设置</h1>
        <p>
          这里只处理引荐后的展示方式。匹配资料仍在「匹配资料」里维护，不和账号设置混在一起。
        </p>
      </header>

      <ContactPreferencesEditor
        initialContactPreferences={initialContactPreferences}
      />

      <section className="app-card referral-rules-card">
        <div className="app-card-head">
          <h2 className="app-card-title">展示规则</h2>
        </div>
        <div className="referral-rule-list">
          <p>没有填写其他方式时，默认展示注册邮箱。</p>
          <p>填写微信号、QQ 号或手机号后，可以选择其中一种展示给对方。</p>
          <p>手机号请使用国际格式，例如 中国 +86 138 0013 8000。</p>
        </div>
      </section>
    </div>
  );
}
