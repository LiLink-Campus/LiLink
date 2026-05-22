"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../../../lib/api";
import {
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  type HardMatchFormState,
} from "../../../../lib/hard-match";
import type { ContactPreferencesPayload, SavedQuestionnairePayload } from "../../_lib/types";

type MyCardEditorClientProps = {
  initialDisplayName: string;
  initialOneLinerIntro: string;
  initialHardMatchForm: HardMatchFormState;
  initialContactPreferences: ContactPreferencesPayload;
  userEmail: string;
  savedQuestionnaire: SavedQuestionnairePayload;
};

type QuestionnaireSaveResponse = {
  saveState: "DRAFT" | "SUBMITTED";
  questionnaireSubmittedAt: string | null;
  hasDraft: boolean;
};

export function MyCardEditorClient({
  initialDisplayName,
  initialOneLinerIntro,
  initialHardMatchForm,
  initialContactPreferences,
  userEmail,
  savedQuestionnaire,
}: MyCardEditorClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [oneLinerIntro, setOneLinerIntro] = useState(initialOneLinerIntro);
  const [preferredChannel, setPreferredChannel] = useState(initialContactPreferences.preferredContactChannel);

  // Contact methods state
  const [wechat, setWechat] = useState(initialContactPreferences.methods.find((m) => m.type === "WECHAT")?.value ?? "");
  const [qq, setQq] = useState(initialContactPreferences.methods.find((m) => m.type === "QQ")?.value ?? "");
  const [phone, setPhone] = useState(initialContactPreferences.methods.find((m) => m.type === "PHONE")?.value ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length < 2) {
      setError("昵称至少需要 2 个字符。");
      return;
    }
    const trimmedOneLinerIntro = oneLinerIntro.trim();
    if (trimmedOneLinerIntro.length === 0) {
      setError("请填写一句话介绍。");
      return;
    }
    if (trimmedOneLinerIntro.length > HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH) {
      setError(
        `一句话介绍请不要超过 ${HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH} 字。`,
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Save contact preferences
      const methods = [
        { type: "WECHAT" as const, value: wechat.trim() },
        { type: "QQ" as const, value: qq.trim() },
        { type: "PHONE" as const, value: phone.trim() },
      ].filter((m) => m.value.length > 0);

      await fetchApi("/me/contact-preferences", {
        method: "PUT",
        body: JSON.stringify({
          preferredContactChannel: preferredChannel,
          methods,
        }),
      });

      // 2. Save questionnaire draft (display name & intro)
      const baseAnswers = savedQuestionnaire?.draft?.softAnswers ?? savedQuestionnaire?.answers ?? {};

      const saveResult = await fetchApi<QuestionnaireSaveResponse>(
        "/me/questionnaire",
        {
          method: "PUT",
          body: JSON.stringify({
            answers: baseAnswers,
            hardMatchForm: {
              ...initialHardMatchForm,
              oneLinerIntro: trimmedOneLinerIntro,
            },
            displayName: trimmedDisplayName,
          }),
        },
      );
      if (saveResult.saveState !== "SUBMITTED") {
        setError(
          "名片已保存为草稿；请先补全匹配资料后再保存可展示的名片。",
        );
        return;
      }

      router.refresh();
      router.back();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-page-shell app-page-shell-narrow v2-page-shell" style={{ paddingBottom: "2rem" }}>
      <section className="app-card" style={{ marginTop: "1rem" }}>
        <form onSubmit={handleSubmit} className="me-card-editor-form" style={{ padding: "1.5rem" }}>
          <div className="me-card-editor-section">
            <label className="referral-field-label">
              <span className="referral-field-name">昵称</span>
              <input
                type="text"
                maxLength={30}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="输入你的昵称"
                required
              />
            </label>

            <label className="referral-field-label">
              <span className="referral-field-name">一句话介绍</span>
              <span className="referral-field-hint">
                兴趣或期待，请勿填写隐私敏感信息。
              </span>
              <textarea
                rows={3}
                maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
                value={oneLinerIntro}
                onChange={(e) => setOneLinerIntro(e.target.value)}
                placeholder="例如：喜欢徒步和电影，希望认识聊得来的朋友。"
              />
            </label>
          </div>

          <div className="me-card-editor-section">
            <h3 className="me-card-editor-subtitle">联系方式</h3>
            <p className="referral-field-hint" style={{ marginBottom: "1rem" }}>
              选择一个首选联系方式，匹配成功后将展示给对方。
            </p>

            <div className="contact-methods-grid">
              <label className={`contact-method-card ${preferredChannel === "EMAIL" ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="preferredChannel"
                  value="EMAIL"
                  checked={preferredChannel === "EMAIL"}
                  onChange={() => setPreferredChannel("EMAIL")}
                />
                <span className="contact-method-name">邮箱 (默认)</span>
                <span className="contact-method-value">{userEmail}</span>
              </label>

              <label className={`contact-method-card ${preferredChannel === "WECHAT" ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="preferredChannel"
                  value="WECHAT"
                  checked={preferredChannel === "WECHAT"}
                  onChange={() => setPreferredChannel("WECHAT")}
                />
                <span className="contact-method-name">微信</span>
                <input
                  type="text"
                  placeholder="微信号"
                  value={wechat}
                  onChange={(e) => {
                    setWechat(e.target.value);
                    if (e.target.value) setPreferredChannel("WECHAT");
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="contact-method-input"
                />
              </label>

              <label className={`contact-method-card ${preferredChannel === "QQ" ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="preferredChannel"
                  value="QQ"
                  checked={preferredChannel === "QQ"}
                  onChange={() => setPreferredChannel("QQ")}
                />
                <span className="contact-method-name">QQ</span>
                <input
                  type="text"
                  placeholder="QQ 号"
                  value={qq}
                  onChange={(e) => {
                    setQq(e.target.value);
                    if (e.target.value) setPreferredChannel("QQ");
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="contact-method-input"
                />
              </label>

              <label className={`contact-method-card ${preferredChannel === "PHONE" ? "is-active" : ""}`}>
                <input
                  type="radio"
                  name="preferredChannel"
                  value="PHONE"
                  checked={preferredChannel === "PHONE"}
                  onChange={() => setPreferredChannel("PHONE")}
                />
                <span className="contact-method-name">手机号</span>
                <input
                  type="tel"
                  placeholder="手机号"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (e.target.value) setPreferredChannel("PHONE");
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="contact-method-input"
                />
              </label>
            </div>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="me-card-editor-actions" style={{ marginTop: "2rem" }}>
            <button
              type="submit"
              className="button-primary"
              disabled={saving || displayName.trim().length < 2}
              style={{ width: "100%" }}
            >
              {saving ? "保存中…" : "保存名片"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
