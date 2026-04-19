"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { fetchApi, type AuthMePayload } from "../../../lib/api";
import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  buildDayOptions,
  buildHardMatchAnswerRecord,
  hardMatchFormFromAnswers,
  toggleMultiSelectValue,
  type HardMatchFormState,
  type HardMatchSchoolOption,
} from "../../../lib/hard-match";
import { SubPageNav } from "../_components/SubPageNav";
import { buildDashboardFieldId } from "../_lib/format";
import {
  getQuestionnaireIncompleteMessage,
  keepCurrentQuestionAnswers,
} from "../_lib/questionnaire";
import type {
  DashboardPayload,
  Question,
  SavedQuestionnairePayload,
} from "../_lib/types";

type ProfileTab = "self" | "partner" | "values";

const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: "self", label: "关于你" },
  { id: "partner", label: "希望 TA" },
  { id: "values", label: "价值观问卷" },
];

export function ProfileClient({
  initialUser,
  initialDashboard,
  initialQuestions,
  initialSchools,
  initialSavedQuestionnaire,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
  initialQuestions: Question[];
  initialSchools: HardMatchSchoolOption[];
  initialSavedQuestionnaire: SavedQuestionnairePayload;
}) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(
    initialDashboard,
  );
  const [questions] = useState<Question[]>(initialQuestions);
  const [schoolOptions] = useState<HardMatchSchoolOption[]>(initialSchools);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    keepCurrentQuestionAnswers(
      initialQuestions,
      initialSavedQuestionnaire?.answers,
    ),
  );
  const [hardMatchForm, setHardMatchForm] = useState<HardMatchFormState>(() =>
    hardMatchFormFromAnswers(
      initialSavedQuestionnaire?.answers,
      initialSchools,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(initialUser.displayName ?? "");
  const [activeTab, setActiveTab] = useState<ProfileTab>("self");

  const birthDayOptions = useMemo(
    () => buildDayOptions(hardMatchForm.birthYear, hardMatchForm.birthMonth),
    [hardMatchForm.birthMonth, hardMatchForm.birthYear],
  );

  useEffect(() => {
    if (!hardMatchForm.birthDay) return;
    if (!birthDayOptions.includes(Number(hardMatchForm.birthDay))) {
      setHardMatchForm((current) => ({ ...current, birthDay: "" }));
    }
  }, [birthDayOptions, hardMatchForm.birthDay]);

  function toggleHardSelection(
    field: "partnerGenders" | "partnerLooks" | "excludedPartnerSchools",
    nextValue: string,
  ) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  async function refreshDashboard() {
    const next = await fetchApi<DashboardPayload>("/me/dashboard");
    setDashboard(next);
  }

  async function saveQuestionnaire() {
    setSaving(true);
    setSavedMessage(null);
    setError(null);

    try {
      const trimmedName = displayName.trim();
      if (trimmedName.length < 2) {
        throw new Error("昵称至少填写 2 个字。");
      }
      const hardMatchAnswers = buildHardMatchAnswerRecord(hardMatchForm);
      await Promise.all([
        fetchApi("/me/questionnaire", {
          method: "PUT",
          body: JSON.stringify({
            answers: { ...hardMatchAnswers, ...answers },
          }),
        }),
        trimmedName
          ? fetchApi("/me/profile", {
              method: "PUT",
              body: JSON.stringify({ displayName: trimmedName }),
            })
          : Promise.resolve(),
      ]);
      await refreshDashboard();
      startTransition(() => {
        setSavedMessage("问卷已保存。");
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "问卷保存失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  const questionnaireIncompleteMessage = useMemo(
    () =>
      getQuestionnaireIncompleteMessage(
        questions,
        answers,
        hardMatchForm,
        displayName,
      ),
    [questions, answers, hardMatchForm, displayName],
  );

  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);

  // Three observable states for the header status chip:
  //   1. never saved          -> warn "未保存"
  //   2. saved + complete     -> on "已保存 · 完整"
  //   3. saved + has gaps     -> warn "已保存 · 待补全"
  const profileStatus: { label: string; tone: "on" | "warn" } =
    !hasSavedQuestionnaire
      ? { label: "未保存", tone: "warn" }
      : questionnaireIncompleteMessage
        ? { label: "已保存 · 待补全", tone: "warn" }
        : { label: "已保存 · 完整", tone: "on" };

  return (
    <main className="page-shell dashboard-page">
      <SubPageNav />

      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">问卷资料</p>
        <h1>客观条件与价值观</h1>
        <p className="dashboard-lede">
          匹配以你<strong>最近一次保存</strong>的内容计算；可随时修改并重新保存。带「可多选」的项目全选等同于不限。
        </p>
        <span
          className={
            profileStatus.tone === "on"
              ? "dashboard-hub-card-status is-on"
              : "dashboard-hub-card-status is-warn"
          }
          style={{ marginTop: "0.55rem" }}
        >
          {profileStatus.label}
        </span>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="content-panel dashboard-panel-wide">
        {questionnaireIncompleteMessage ? (
          <p className="form-error" role="alert">
            {questionnaireIncompleteMessage}
          </p>
        ) : null}

        <nav aria-label="问卷分组" className="dashboard-section-tabs">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                tab.id === activeTab
                  ? "dashboard-section-tab is-active"
                  : "dashboard-section-tab"
              }
              aria-pressed={tab.id === activeTab}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── 关于你 ── */}
        {activeTab === "self" && (
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-self">
              我
            </span>
            <div>
              <h3>关于你</h3>
              <p>你的基本客观信息</p>
            </div>
          </div>
          <div className="question-list">
            <fieldset className="question-block">
              <legend>出生日期</legend>
              <div className="form-grid birth-date-grid">
                <label>
                  <span>年份</span>
                  <select
                    id={buildDashboardFieldId("birth-year")}
                    name="birthYear"
                    value={hardMatchForm.birthYear}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        birthYear: e.target.value,
                      }))
                    }
                  >
                    <option value="">请选择</option>
                    {BIRTH_YEAR_OPTIONS.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>月份</span>
                  <select
                    id={buildDashboardFieldId("birth-month")}
                    name="birthMonth"
                    value={hardMatchForm.birthMonth}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        birthMonth: e.target.value,
                      }))
                    }
                  >
                    <option value="">请选择</option>
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m} value={String(m)}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>日期</span>
                  <select
                    id={buildDashboardFieldId("birth-day")}
                    name="birthDay"
                    value={hardMatchForm.birthDay}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        birthDay: e.target.value,
                      }))
                    }
                  >
                    <option value="">请选择</option>
                    {birthDayOptions.map((d) => (
                      <option key={d} value={String(d)}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>性别</legend>
              <div className="option-list">
                {HARD_MATCH_GENDERS.map((g, i) => (
                  <label key={g}>
                    <input
                      checked={hardMatchForm.gender === g}
                      id={buildDashboardFieldId("gender", i)}
                      type="radio"
                      name="gender"
                      onChange={() =>
                        setHardMatchForm((f) => ({ ...f, gender: g }))
                      }
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>颜值自评</legend>
              <div className="option-list">
                {HARD_MATCH_LOOKS.map((l, i) => (
                  <label key={l}>
                    <input
                      checked={hardMatchForm.looks === l}
                      id={buildDashboardFieldId("looks", i)}
                      type="radio"
                      name="looks"
                      onChange={() =>
                        setHardMatchForm((f) => ({ ...f, looks: l }))
                      }
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>身高（厘米）</legend>
              <select
                id={buildDashboardFieldId("height-cm")}
                name="heightCm"
                value={hardMatchForm.heightCm}
                onChange={(e) =>
                  setHardMatchForm((f) => ({
                    ...f,
                    heightCm: e.target.value,
                  }))
                }
              >
                <option value="">请选择</option>
                {HEIGHT_OPTIONS.map((h) => (
                  <option key={h} value={String(h)}>
                    {h} cm
                  </option>
                ))}
              </select>
            </fieldset>

            <fieldset className="question-block">
              <legend>昵称</legend>
              <label className="dash-one-liner-label">
                <span className="dashboard-muted">
                  昵称，引荐后会发给对方邮件，可以是真名也可以不是。
                </span>
                <input
                  id={buildDashboardFieldId("display-name")}
                  name="displayName"
                  type="text"
                  maxLength={30}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="输入你的昵称"
                />
              </label>
            </fieldset>

            <fieldset className="question-block">
              <legend>一句话介绍</legend>
              <label className="dash-one-liner-label">
                <span className="dashboard-muted">
                  用一两句话介绍你的兴趣或期待；引荐邮件中会展示给对方。请勿填写隐私敏感信息。
                </span>
                <textarea
                  id={buildDashboardFieldId("one-liner-intro")}
                  name="oneLinerIntro"
                  rows={3}
                  maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
                  value={hardMatchForm.oneLinerIntro}
                  onChange={(e) =>
                    setHardMatchForm((f) => ({
                      ...f,
                      oneLinerIntro: e.target.value,
                    }))
                  }
                  placeholder="例如：喜欢徒步和电影，希望认识聊得来的朋友。"
                />
              </label>
            </fieldset>
          </div>
        </div>
        )}

        {/* ── 对方条件 ── */}
        {activeTab === "partner" && (
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-partner">
              TA
            </span>
            <div>
              <h3>对方条件</h3>
              <p>你希望匹配对象满足的条件</p>
            </div>
          </div>
          <div className="question-list">
            <fieldset className="question-block">
              <legend>希望对方的年龄范围</legend>
              <div className="form-grid">
                <label>
                  <span>年龄下限</span>
                  <select
                    id={buildDashboardFieldId("partner-age-min")}
                    name="partnerAgeMin"
                    value={hardMatchForm.partnerAgeMin}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerAgeMin: e.target.value,
                      }))
                    }
                  >
                    {AGE_OPTIONS.map((a) => (
                      <option key={a} value={String(a)}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>年龄上限</span>
                  <select
                    id={buildDashboardFieldId("partner-age-max")}
                    name="partnerAgeMax"
                    value={hardMatchForm.partnerAgeMax}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerAgeMax: e.target.value,
                      }))
                    }
                  >
                    {AGE_OPTIONS.map((a) => (
                      <option key={a} value={String(a)}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>希望对方的性别（可多选）</legend>
              <div className="chip-grid">
                {HARD_MATCH_GENDERS.map((g, i) => {
                  const active = hardMatchForm.partnerGenders.includes(g);
                  return (
                    <label
                      key={g}
                      className={active ? "chip active" : "chip"}
                    >
                      <input
                        checked={active}
                        id={buildDashboardFieldId("partner-genders", i)}
                        name="partnerGenders"
                        type="checkbox"
                        onChange={() =>
                          toggleHardSelection("partnerGenders", g)
                        }
                      />
                      <span>{g}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>希望对方的颜值（可多选）</legend>
              <div className="chip-grid">
                {HARD_MATCH_LOOKS.map((l, i) => {
                  const active = hardMatchForm.partnerLooks.includes(l);
                  return (
                    <label
                      key={l}
                      className={active ? "chip active" : "chip"}
                    >
                      <input
                        checked={active}
                        id={buildDashboardFieldId("partner-looks", i)}
                        name="partnerLooks"
                        type="checkbox"
                        onChange={() =>
                          toggleHardSelection("partnerLooks", l)
                        }
                      />
                      <span>{l}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>希望对方的身高范围（厘米）</legend>
              <div className="form-grid">
                <label>
                  <span>身高下限</span>
                  <select
                    id={buildDashboardFieldId("partner-height-min")}
                    name="partnerHeightMin"
                    value={hardMatchForm.partnerHeightMin}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerHeightMin: e.target.value,
                      }))
                    }
                  >
                    {HEIGHT_OPTIONS.map((h) => (
                      <option key={h} value={String(h)}>
                        {h} cm
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>身高上限</span>
                  <select
                    id={buildDashboardFieldId("partner-height-max")}
                    name="partnerHeightMax"
                    value={hardMatchForm.partnerHeightMax}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerHeightMax: e.target.value,
                      }))
                    }
                  >
                    {HEIGHT_OPTIONS.map((h) => (
                      <option key={h} value={String(h)}>
                        {h} cm
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>不希望对方是哪个学校的（可多选）</legend>
              <p className="dashboard-muted">
                选中的学校将被排除，不选则不限。
              </p>
              <div className="chip-grid">
                {schoolOptions.map((school, i) => {
                  const active = hardMatchForm.excludedPartnerSchools.includes(
                    school.id,
                  );
                  return (
                    <label
                      key={school.id}
                      className={active ? "chip active" : "chip"}
                    >
                      <input
                        checked={active}
                        id={buildDashboardFieldId(
                          "excluded-partner-schools",
                          i,
                        )}
                        name="excludedPartnerSchools"
                        type="checkbox"
                        onChange={() =>
                          toggleHardSelection(
                            "excludedPartnerSchools",
                            school.id,
                          )
                        }
                      />
                      <span>{school.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>
        )}

        {/* ── 价值观问卷 ── */}
        {activeTab === "values" && questions.length > 0 && (
          <div className="dash-q-group">
            <div className="dash-q-group-header">
              <span className="dash-q-group-icon dash-q-group-icon-values">
                Q
              </span>
              <div>
                <h3>价值观问卷</h3>
                <p>共 {questions.length} 题，作为匹配算法的核心输入</p>
              </div>
            </div>
            <div className="question-list">
              {questions.map((question, questionIndex) => {
                const value = answers[question.key];
                const questionTitle = (
                  <div
                    aria-hidden="true"
                    className="question-block-title"
                  >
                    <span className="dash-q-num">{questionIndex + 1}</span>
                    <span>{question.prompt}</span>
                  </div>
                );

                if (question.type === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value : [];
                  const selectionLimit = question.selectionLimit ?? null;
                  const reachedSelectionLimit =
                    selectionLimit != null &&
                    selected.length >= selectionLimit;
                  return (
                    <fieldset
                      key={question.id}
                      className="question-block"
                    >
                      <legend className="question-block-legend">
                        {question.prompt}
                      </legend>
                      {questionTitle}
                      {selectionLimit != null ? (
                        <p className="dashboard-muted">
                          本题最多选择 {selectionLimit} 项。
                        </p>
                      ) : null}
                      <div className="chip-grid">
                        {question.options?.map((option, optionIndex) => {
                          const active = selected.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className={active ? "chip active" : "chip"}
                            >
                              <input
                                checked={active}
                                disabled={
                                  !active && reachedSelectionLimit
                                }
                                id={buildDashboardFieldId(
                                  "question",
                                  question.id,
                                  optionIndex,
                                )}
                                name={question.key}
                                type="checkbox"
                                onChange={() =>
                                  setAnswers((current) => {
                                    const cur = Array.isArray(
                                      current[question.key],
                                    )
                                      ? (current[question.key] as string[])
                                      : [];
                                    if (active) {
                                      return {
                                        ...current,
                                        [question.key]: cur.filter(
                                          (v) => v !== option.value,
                                        ),
                                      };
                                    }

                                    if (
                                      selectionLimit != null &&
                                      cur.length >= selectionLimit
                                    ) {
                                      return current;
                                    }

                                    return {
                                      ...current,
                                      [question.key]: [
                                        ...cur,
                                        option.value,
                                      ],
                                    };
                                  })
                                }
                              />
                              <span>{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                }

                return (
                  <fieldset key={question.id} className="question-block">
                    <legend className="question-block-legend">
                      {question.prompt}
                    </legend>
                    {questionTitle}
                    <div className="option-list">
                      {question.options?.map((option, optionIndex) => (
                        <label key={option.value}>
                          <input
                            checked={value === option.value}
                            id={buildDashboardFieldId(
                              "question",
                              question.id,
                              optionIndex,
                            )}
                            type="radio"
                            name={question.key}
                            onChange={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.key]: option.value,
                              }))
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </div>
        )}

        <button
          className="button-primary"
          disabled={saving}
          type="button"
          onClick={() => void saveQuestionnaire()}
          style={{ marginTop: "1.5rem" }}
        >
          {saving ? "保存中…" : "保存全部问卷"}
        </button>
      </section>
    </main>
  );
}
