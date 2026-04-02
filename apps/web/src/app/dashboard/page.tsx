"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";
import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_RACES,
  MONTH_OPTIONS,
  buildDayOptions,
  buildHardMatchAnswerRecord,
  createEmptyHardMatchForm,
  hardMatchFormFromAnswers,
  toggleMultiSelectValue,
  type HardMatchFormState,
} from "../../lib/hard-match";

type Question = {
  id: string;
  key: string;
  prompt: string;
  type: "SCALE" | "SINGLE_SELECT" | "MULTI_SELECT";
  options?: string[];
};

type DashboardPayload = {
  questionnaireSubmittedAt: string | null;
  currentCycle: {
    id: string;
    codename: string;
    revealAt: string;
    participationDeadline: string;
    participationStatus: "OPTED_IN" | "OPTED_OUT";
  } | null;
  latestMatch: {
    id: string;
    score: number;
    reasons: string[];
    introducedAt: string | null;
    currentUserRequestedAt: string | null;
    reportStatus: string | null;
    participants: Array<{
      userId: string;
      displayName: string | null;
      headline: string | null;
      email: string | null;
      schoolName: string | null;
      contactRequestedAt: string | null;
    }>;
  } | null;
};

type AuthPayload = {
  id: string;
  email: string;
  displayName: string | null;
};

type QuestionnairePayload = {
  questions: Question[];
};

type SavedQuestionnairePayload = {
  answers: Record<string, unknown>;
} | null;

function keepCurrentQuestionAnswers(
  questions: Question[],
  savedAnswers: Record<string, unknown> | undefined,
) {
  if (!savedAnswers) {
    return {};
  }

  const allowedQuestionKeys = new Set(
    questions.map((question) => question.key),
  );

  return Object.fromEntries(
    Object.entries(savedAnswers).filter(([key]) =>
      allowedQuestionKeys.has(key),
    ),
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<AuthPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [hardMatchForm, setHardMatchForm] = useState<HardMatchFormState>(
    createEmptyHardMatchForm,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("骚扰");
  const [reportDetails, setReportDetails] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const birthDayOptions = useMemo(
    () => buildDayOptions(hardMatchForm.birthYear, hardMatchForm.birthMonth),
    [hardMatchForm.birthMonth, hardMatchForm.birthYear],
  );

  useEffect(() => {
    if (!hardMatchForm.birthDay) {
      return;
    }

    if (!birthDayOptions.includes(Number(hardMatchForm.birthDay))) {
      setHardMatchForm((current) => ({
        ...current,
        birthDay: "",
      }));
    }
  }, [birthDayOptions, hardMatchForm.birthDay]);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError(null);

      try {
        const [me, dashboardData, questionnaire, savedQuestionnaire] =
          await Promise.all([
            fetchApi<AuthPayload>("/auth/me"),
            fetchApi<DashboardPayload>("/me/dashboard"),
            fetchApi<QuestionnairePayload>("/questionnaire/current"),
            fetchApi<SavedQuestionnairePayload>("/me/questionnaire").catch(
              () => null,
            ),
          ]);

        if (!active) {
          return;
        }

        setUser(me);
        setDashboard(dashboardData);
        setQuestions(questionnaire.questions);
        setAnswers(
          keepCurrentQuestionAnswers(
            questionnaire.questions,
            savedQuestionnaire?.answers,
          ),
        );
        setHardMatchForm(hardMatchFormFromAnswers(savedQuestionnaire?.answers));
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error ? caughtError.message : "页面加载失败。",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void boot();

    return () => {
      active = false;
    };
  }, []);

  const counterpart = useMemo(() => {
    if (!dashboard?.latestMatch || !user) {
      return null;
    }

    return (
      dashboard.latestMatch.participants.find(
        (participant) => participant.userId !== user.id,
      ) ?? null
    );
  }, [dashboard?.latestMatch, user]);

  function toggleHardSelection(
    field: "partnerGenders" | "partnerLooks" | "partnerRaces",
    nextValue: string,
  ) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  async function saveQuestionnaire() {
    setSaving("questionnaire");
    setSavedMessage(null);
    setError(null);

    try {
      const hardMatchAnswers = buildHardMatchAnswerRecord(hardMatchForm);

      await fetchApi("/me/questionnaire", {
        method: "PUT",
        body: JSON.stringify({
          answers: {
            ...hardMatchAnswers,
            ...answers,
          },
        }),
      });

      startTransition(() => {
        setSavedMessage("问卷已保存。");
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "问卷保存失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  async function toggleParticipation(nextValue: boolean) {
    setSaving("participation");
    setSavedMessage(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: nextValue }),
      });

      setDashboard((current) =>
        current?.currentCycle
          ? {
              ...current,
              currentCycle: {
                ...current.currentCycle,
                participationStatus: nextValue ? "OPTED_IN" : "OPTED_OUT",
              },
            }
          : current,
      );
      setSavedMessage(
        nextValue ? "你已参加本轮匹配。" : "你已跳过本轮，仍可随时改回。",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "参与状态更新失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  async function requestContact() {
    if (!dashboard?.latestMatch) {
      return;
    }

    setSaving("contact");
    setSavedMessage(null);
    try {
      await fetchApi(`/me/matches/${dashboard.latestMatch.id}/contact`, {
        method: "POST",
      });
      setDashboard((current) =>
        current?.latestMatch
          ? {
              ...current,
              latestMatch: {
                ...current.latestMatch,
                introducedAt: new Date().toISOString(),
                currentUserRequestedAt: new Date().toISOString(),
              },
            }
          : current,
      );
      setSavedMessage("已向双方发送引荐邮件。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "引荐发送失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  async function submitReport() {
    if (!dashboard?.latestMatch) {
      return;
    }

    setSaving("report");
    setSavedMessage(null);
    try {
      await fetchApi(`/me/matches/${dashboard.latestMatch.id}/report`, {
        method: "POST",
        body: JSON.stringify({
          reason: reportReason,
          ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}),
        }),
      });
      setDashboard((current) =>
        current?.latestMatch
          ? {
              ...current,
              latestMatch: {
                ...current.latestMatch,
                reportStatus: "OPEN",
              },
            }
          : current,
      );
      setReportOpen(false);
      setReportDetails("");
      setSavedMessage("举报已提交，系统已将该对象从你后续轮次里隔离。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "举报提交失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  const nextRevealLabel = dashboard?.currentCycle
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }).format(new Date(dashboard.currentCycle.revealAt))
    : null;

  if (loading) {
    return (
      <main className="page-shell prose-shell">
        <section
          className="content-panel dashboard-panel-wide"
          style={{ textAlign: "center", padding: "4rem 2rem" }}
        >
          <p className="eyebrow">我的匹配</p>
          <h1>正在加载…</h1>
        </section>
      </main>
    );
  }

  if (error && !dashboard) {
    return (
      <main className="page-shell prose-shell">
        <section
          className="content-panel dashboard-panel-wide"
          style={{ textAlign: "center", padding: "4rem 2rem" }}
        >
          <p className="eyebrow">我的匹配</p>
          <h1>暂时无法进入该页面</h1>
          <p>{error}</p>
          <Link className="button-primary" href="/login">
            去登录
          </Link>
        </section>
      </main>
    );
  }

  const isOptedIn = dashboard?.currentCycle?.participationStatus === "OPTED_IN";
  const introduced = Boolean(dashboard?.latestMatch?.introducedAt);

  return (
    <main className="page-shell dashboard-page">
      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">我的匹配</p>
        <h1>欢迎回来</h1>
        <p className="dashboard-lede">
          在这里填写硬性条件、完成价值观问卷，并决定是否参加当前轮次。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="dashboard-panel-wide">
        <div className="dashboard-reveal-card">
          <div className="dashboard-reveal-copy">
            <p className="dashboard-reveal-label">下次揭晓时间</p>
            <p className="dashboard-reveal-time">
              {nextRevealLabel ?? "当前没有开放中的轮次"}
            </p>
          </div>
          {dashboard?.currentCycle ? (
            <div className="dashboard-reveal-actions">
              <span
                className={
                  isOptedIn
                    ? "dashboard-participation-pill on"
                    : "dashboard-participation-pill"
                }
              >
                {isOptedIn ? "本轮参与中" : "本轮未参与"}
              </span>
              <button
                className={isOptedIn ? "button-secondary" : "button-primary"}
                disabled={saving === "participation"}
                type="button"
                onClick={() => toggleParticipation(!isOptedIn)}
              >
                {saving === "participation"
                  ? "更新中…"
                  : isOptedIn
                    ? "取消本轮"
                    : "参加本轮"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="content-panel dashboard-panel-wide">
        <p className="eyebrow">匹配</p>
        {counterpart ? (
          <>
            <h2>{introduced ? "引荐与说明" : "本轮匹配"}</h2>
            {!introduced ? (
              <p className="dashboard-muted">
                揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。
              </p>
            ) : null}
            {introduced && counterpart.email ? (
              <p className="form-success dashboard-match-email">
                联络邮箱：{counterpart.email}
              </p>
            ) : null}
            <ul className="reason-list">
              {dashboard?.latestMatch?.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="auth-actions">
              {introduced ? (
                <span className="domain-chip">已引荐</span>
              ) : (
                <button
                  className="button-primary"
                  disabled={saving === "contact"}
                  type="button"
                  onClick={() => void requestContact()}
                >
                  {saving === "contact" ? "发送中…" : "双方引荐联系"}
                </button>
              )}
              {dashboard?.latestMatch?.reportStatus ? (
                <span className="domain-chip">举报处理中</span>
              ) : (
                <button
                  className="button-secondary"
                  disabled={saving === "report"}
                  type="button"
                  onClick={() => setReportOpen((current) => !current)}
                >
                  举报
                </button>
              )}
            </div>
            {reportOpen ? (
              <div className="report-form">
                <label>
                  <span>举报原因</span>
                  <select
                    value={reportReason}
                    onChange={(event) => setReportReason(event.target.value)}
                  >
                    <option value="骚扰">骚扰</option>
                    <option value="冒犯内容">冒犯内容</option>
                    <option value="身份异常">身份异常</option>
                    <option value="恶意行为">恶意行为</option>
                    <option value="其他">其他</option>
                  </select>
                </label>
                <label>
                  <span>补充说明（可选）</span>
                  <textarea
                    rows={3}
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value)}
                  />
                </label>
                <button
                  className="button-primary"
                  disabled={saving === "report"}
                  type="button"
                  onClick={() => void submitReport()}
                >
                  {saving === "report" ? "提交中…" : "确认举报"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h2>还没有匹配结果</h2>
            <p className="dashboard-muted">
              本轮揭晓后将在此显示匹配说明与后续操作。
            </p>
          </>
        )}
      </section>

      <section className="content-panel dashboard-panel-wide">
        <p className="eyebrow">问卷</p>
        <h2>客观条件与价值观</h2>
        <p className="dashboard-muted">
          以下包含客观筛选条件与价值观问卷。客观条件中带“可多选”的项目支持多选；如果把该组选项全选，算法会视为不限。
        </p>

        <div className="question-list">
          {/* ── 硬性条件部分 ── */}
          <fieldset className="question-block">
            <legend>出生年月日与希望对方年龄范围</legend>
            <div className="form-grid">
              <label>
                <span>出生年份</span>
                <select
                  value={hardMatchForm.birthYear}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      birthYear: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {BIRTH_YEAR_OPTIONS.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>出生月份</span>
                <select
                  value={hardMatchForm.birthMonth}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      birthMonth: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month} value={String(month)}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>出生日期</span>
                <select
                  value={hardMatchForm.birthDay}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      birthDay: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {birthDayOptions.map((day) => (
                    <option key={day} value={String(day)}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>希望对方年龄下限</span>
                <select
                  value={hardMatchForm.partnerAgeMin}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      partnerAgeMin: event.target.value,
                    }))
                  }
                >
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={String(age)}>
                      {age}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>希望对方年龄上限</span>
                <select
                  value={hardMatchForm.partnerAgeMax}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      partnerAgeMax: event.target.value,
                    }))
                  }
                >
                  {AGE_OPTIONS.map((age) => (
                    <option key={age} value={String(age)}>
                      {age}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="question-block">
            <legend>性别与希望对方的性别</legend>
            <div className="form-grid">
              <label>
                <span>你的性别</span>
                <select
                  value={hardMatchForm.gender}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      gender: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {HARD_MATCH_GENDERS.map((gender) => (
                    <option key={gender} value={gender}>
                      {gender}
                    </option>
                  ))}
                </select>
              </label>
              <div className="full-span">
                <span className="admin-field-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                  希望对方的性别（可多选）
                </span>
                <div className="chip-grid">
                  {HARD_MATCH_GENDERS.map((gender) => {
                    const active =
                      hardMatchForm.partnerGenders.includes(gender);

                    return (
                      <label
                        key={gender}
                        className={active ? "chip active" : "chip"}
                      >
                        <input
                          checked={active}
                          type="checkbox"
                          onChange={() =>
                            toggleHardSelection("partnerGenders", gender)
                          }
                        />
                        <span>{gender}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="question-block">
            <legend>颜值自评与希望对方的颜值</legend>
            <div className="form-grid">
              <label>
                <span>你的颜值自评</span>
                <select
                  value={hardMatchForm.looks}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      looks: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {HARD_MATCH_LOOKS.map((looks) => (
                    <option key={looks} value={looks}>
                      {looks}
                    </option>
                  ))}
                </select>
              </label>
              <div className="full-span">
                <span className="admin-field-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                  希望对方的颜值（可多选）
                </span>
                <div className="chip-grid">
                  {HARD_MATCH_LOOKS.map((looks) => {
                    const active = hardMatchForm.partnerLooks.includes(looks);

                    return (
                      <label
                        key={looks}
                        className={active ? "chip active" : "chip"}
                      >
                        <input
                          checked={active}
                          type="checkbox"
                          onChange={() =>
                            toggleHardSelection("partnerLooks", looks)
                          }
                        />
                        <span>{looks}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="question-block">
            <legend>人种与希望对方的人种</legend>
            <div className="form-grid">
              <label>
                <span>你的人种</span>
                <select
                  value={hardMatchForm.race}
                  onChange={(event) =>
                    setHardMatchForm((current) => ({
                      ...current,
                      race: event.target.value,
                    }))
                  }
                >
                  <option value="">请选择</option>
                  {HARD_MATCH_RACES.map((race) => (
                    <option key={race} value={race}>
                      {race}
                    </option>
                  ))}
                </select>
              </label>
              <div className="full-span">
                <span className="admin-field-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                  希望对方的人种（可多选）
                </span>
                <div className="chip-grid">
                  {HARD_MATCH_RACES.map((race) => {
                    const active = hardMatchForm.partnerRaces.includes(race);

                    return (
                      <label
                        key={race}
                        className={active ? "chip active" : "chip"}
                      >
                        <input
                          checked={active}
                          type="checkbox"
                          onChange={() =>
                            toggleHardSelection("partnerRaces", race)
                          }
                        />
                        <span>{race}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </fieldset>

          {/* ── 动态价值观问卷部分 ── */}
          {questions.map((question) => {
            const value = answers[question.key];

            if (question.type === "MULTI_SELECT") {
              const selected = Array.isArray(value) ? value : [];

              return (
                <fieldset key={question.id} className="question-block">
                  <legend>{question.prompt}</legend>
                  <div className="chip-grid">
                    {question.options?.map((option) => {
                      const active = selected.includes(option);

                      return (
                        <label
                          key={option}
                          className={active ? "chip active" : "chip"}
                        >
                          <input
                            checked={active}
                            type="checkbox"
                            onChange={() =>
                              setAnswers((current) => {
                                const currentValues = Array.isArray(
                                  current[question.key],
                                )
                                  ? (current[question.key] as string[])
                                  : [];

                                return {
                                  ...current,
                                  [question.key]: active
                                    ? currentValues.filter(
                                        (item) => item !== option,
                                      )
                                    : [...currentValues, option],
                                };
                              })
                            }
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            }

            return (
              <fieldset key={question.id} className="question-block">
                <legend>{question.prompt}</legend>
                <div className="option-list">
                  {question.options?.map((option) => (
                    <label key={option}>
                      <input
                        checked={value === option}
                        type="radio"
                        name={question.key}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.key]: option,
                          }))
                        }
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
        <button
          className="button-primary"
          disabled={saving === "questionnaire"}
          type="button"
          onClick={() => void saveQuestionnaire()}
          style={{ marginTop: "1.5rem" }}
        >
          {saving === "questionnaire" ? "保存中…" : "保存全部问卷"}
        </button>
      </section>
    </main>
  );
}
