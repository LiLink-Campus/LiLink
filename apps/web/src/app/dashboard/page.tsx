"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";
import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LOOKS,
  HEIGHT_OPTIONS,
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
  selectionLimit?: number | null;
  options?: Array<{
    value: string;
    label: string;
  }>;
};

type DashboardPayload = {
  questionnaireSubmittedAt: string | null;
  currentCycle: {
    id: string;
    codename: string;
    revealAt: string;
    participationDeadline: string;
    status: "DRAFT" | "OPEN" | "REVEAL_READY" | "REVEALED";
    participationStatus: "OPTED_IN" | "OPTED_OUT";
  } | null;
  lastRevealedRound: {
    cycleId: string;
    codename: string;
    revealAt: string;
    participationStatus: "OPTED_IN" | "OPTED_OUT";
    matched: boolean;
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
      introLine: string | null;
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

function buildDashboardFieldId(...parts: Array<string | number>) {
  return `dashboard-${parts.join("-")}`;
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
  const [displayName, setDisplayName] = useState("");
  const [reportReason, setReportReason] = useState("骚扰");
  const [reportDetails, setReportDetails] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState("");

  useEffect(() => {
    setEditingDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

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
            fetchApi<SavedQuestionnairePayload>("/me/questionnaire").catch(() => null),
          ]);

        if (!active) return;

        setUser(me);
        setDisplayName(me.displayName ?? "");
        setDashboard(dashboardData);
        setQuestions(questionnaire.questions);
        setAnswers(keepCurrentQuestionAnswers(questionnaire.questions, savedQuestionnaire?.answers));
        setHardMatchForm(hardMatchFormFromAnswers(savedQuestionnaire?.answers));
      } catch (caughtError) {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "页面加载失败。");
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();
    return () => { active = false; };
  }, []);

  const counterpart = useMemo(() => {
    if (!dashboard?.latestMatch || !user) return null;
    return dashboard.latestMatch.participants.find((p) => p.userId !== user.id) ?? null;
  }, [dashboard?.latestMatch, user]);

  function toggleHardSelection(
    field: "partnerGenders" | "partnerLooks",
    nextValue: string,
  ) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  async function saveDisplayName() {
    const trimmed = editingDisplayName.trim();
    if (trimmed.length < 2) return;
    setSaving("displayName");
    setSavedMessage(null);
    setError(null);
    try {
      const result = await fetchApi<{ displayName: string | null }>("/me/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName: trimmed }),
      });
      setUser((current) => current ? { ...current, displayName: result.displayName } : current);
      startTransition(() => { setSavedMessage("昵称已更新。"); });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "昵称保存失败。");
    } finally {
      setSaving(null);
    }
  }

  async function saveQuestionnaire() {
    setSaving("questionnaire");
    setSavedMessage(null);
    setError(null);

    try {
      const hardMatchAnswers = buildHardMatchAnswerRecord(hardMatchForm);
      const trimmedName = displayName.trim();
      await Promise.all([
        fetchApi("/me/questionnaire", {
          method: "PUT",
          body: JSON.stringify({ answers: { ...hardMatchAnswers, ...answers } }),
        }),
        trimmedName
          ? fetchApi("/me/profile", {
              method: "PUT",
              body: JSON.stringify({ displayName: trimmedName }),
            })
          : Promise.resolve(),
      ]);
      startTransition(() => { setSavedMessage("问卷已保存。"); });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "问卷保存失败。");
    } finally {
      setSaving(null);
    }
  }

  async function toggleParticipation(nextValue: boolean) {
    setSaving("participation");
    setSavedMessage(null);
    try {
      await fetchApi("/me/participation", { method: "PUT", body: JSON.stringify({ optIn: nextValue }) });
      setDashboard((current) =>
        current?.currentCycle
          ? { ...current, currentCycle: { ...current.currentCycle, participationStatus: nextValue ? "OPTED_IN" : "OPTED_OUT" } }
          : current,
      );
      setSavedMessage(nextValue ? "你已参加本轮匹配。" : "你已跳过本轮，仍可随时改回。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "参与状态更新失败。");
    } finally {
      setSaving(null);
    }
  }

  async function requestContact() {
    if (!dashboard?.latestMatch) return;
    setSaving("contact");
    setSavedMessage(null);
    try {
      await fetchApi(`/me/matches/${dashboard.latestMatch.id}/contact`, { method: "POST" });
      setDashboard((current) =>
        current?.latestMatch
          ? { ...current, latestMatch: { ...current.latestMatch, introducedAt: new Date().toISOString(), currentUserRequestedAt: new Date().toISOString() } }
          : current,
      );
      setSavedMessage("已向双方发送引荐邮件。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "引荐发送失败。");
    } finally {
      setSaving(null);
    }
  }

  async function submitReport() {
    if (!dashboard?.latestMatch) return;
    setSaving("report");
    setSavedMessage(null);
    try {
      await fetchApi(`/me/matches/${dashboard.latestMatch.id}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason, ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}) }),
      });
      setDashboard((current) =>
        current?.latestMatch ? { ...current, latestMatch: { ...current.latestMatch, reportStatus: "OPEN" } } : current,
      );
      setReportOpen(false);
      setReportDetails("");
      setSavedMessage("举报已提交，系统已将该对象从你后续轮次里隔离。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "举报提交失败。");
    } finally {
      setSaving(null);
    }
  }

  const nextRevealLabel = dashboard?.currentCycle
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(dashboard.currentCycle.revealAt))
    : null;

  if (loading) {
    return (
      <main className="page-shell prose-shell">
        <section className="content-panel dashboard-panel-wide" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p className="eyebrow">我的匹配</p>
          <h1>正在加载…</h1>
        </section>
      </main>
    );
  }

  if (error && !dashboard) {
    return (
      <main className="page-shell prose-shell">
        <section className="content-panel dashboard-panel-wide" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p className="eyebrow">我的匹配</p>
          <h1>暂时无法进入该页面</h1>
          <p>{error}</p>
          <Link className="button-primary" href="/login">去登录</Link>
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
          在这里填写个人信息、完成价值观问卷，并决定是否参加当前轮次。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="dashboard-panel-wide">
        <div className="dashboard-reveal-card">
          <div className="dashboard-reveal-copy">
            <p className="dashboard-reveal-label">下次揭晓时间</p>
            <p className="dashboard-reveal-time">{nextRevealLabel ?? "当前没有开放中的轮次"}</p>
          </div>
          {dashboard?.currentCycle ? (
            <div className="dashboard-reveal-actions">
              <span className={isOptedIn ? "dashboard-participation-pill on" : "dashboard-participation-pill"}>
                {isOptedIn ? "本轮参与中" : "本轮未参与"}
              </span>
              <button className={isOptedIn ? "button-secondary" : "button-primary"} disabled={saving === "participation"} type="button" onClick={() => toggleParticipation(!isOptedIn)}>
                {saving === "participation" ? "更新中…" : isOptedIn ? "取消本轮" : "参加本轮"}
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
            {!introduced ? <p className="dashboard-muted">揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。</p> : null}
            {introduced && counterpart.email ? <p className="form-success dashboard-match-email">联络邮箱：{counterpart.email}</p> : null}
            {introduced && counterpart.introLine ? (
              <p className="dashboard-muted dashboard-match-intro">对方一句话介绍：{counterpart.introLine}</p>
            ) : null}
            <ul className="reason-list">
              {dashboard?.latestMatch?.reasons.map((reason) => (<li key={reason}>{reason}</li>))}
            </ul>
            <div className="auth-actions">
              {introduced ? (
                <span className="domain-chip">已引荐</span>
              ) : (
                <button className="button-primary" disabled={saving === "contact"} type="button" onClick={() => void requestContact()}>
                  {saving === "contact" ? "发送中…" : "双方引荐联系"}
                </button>
              )}
              {dashboard?.latestMatch?.reportStatus ? (
                <span className="domain-chip">举报处理中</span>
              ) : (
                <button className="button-secondary" disabled={saving === "report"} type="button" onClick={() => setReportOpen((c) => !c)}>举报</button>
              )}
            </div>
            {reportOpen ? (
              <div className="report-form">
                <label>
                  <span>举报原因</span>
                  <select id={buildDashboardFieldId("report-reason")} name="reportReason" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                    <option value="骚扰">骚扰</option>
                    <option value="冒犯内容">冒犯内容</option>
                    <option value="身份异常">身份异常</option>
                    <option value="恶意行为">恶意行为</option>
                    <option value="其他">其他</option>
                  </select>
                </label>
                <label>
                  <span>补充说明（可选）</span>
                  <textarea id={buildDashboardFieldId("report-details")} name="reportDetails" rows={3} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
                </label>
                <button className="button-primary" disabled={saving === "report"} type="button" onClick={() => void submitReport()}>
                  {saving === "report" ? "提交中…" : "确认举报"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {dashboard?.currentCycle?.participationStatus === "OPTED_IN" &&
            (dashboard.currentCycle.status === "OPEN" || dashboard.currentCycle.status === "REVEAL_READY") ? (
              <>
                <h2>还没有匹配结果</h2>
                <p className="dashboard-muted">本轮揭晓后将在此显示匹配说明与后续操作。</p>
              </>
            ) : dashboard?.lastRevealedRound?.participationStatus === "OPTED_IN" && !dashboard.lastRevealedRound.matched ? (
              <>
                <h2>本轮未匹配到对象</h2>
                <p className="dashboard-muted">
                  你已参加「{dashboard.lastRevealedRound.codename}」这轮匹配；本轮可配对人数不足或没有与你相容的组合，因此没有为你生成匹配对象。
                </p>
                <p className="dashboard-muted">下一轮开放报名时，在页面上方点击「参加本轮」即可再次参与；你也可以更新问卷，提高下次匹配成功率。</p>
              </>
            ) : (
              <>
                <h2>还没有匹配结果</h2>
                <p className="dashboard-muted">报名参加当前轮次并在揭晓后返回此处查看结果。</p>
              </>
            )}
          </>
        )}
      </section>

      {/* ── Questionnaire ─────────────────────────────────── */}
      <section className="content-panel dashboard-panel-wide">
        <p className="eyebrow">问卷</p>
        <h2>客观条件与价值观</h2>
        <p className="dashboard-muted">
          填写你的基本信息和对另一半的期望，再完成价值观问卷。带「可多选」的项目全选等同于不限。
        </p>

        {/* ── 关于你 ── */}
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-self">我</span>
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
                  <select id={buildDashboardFieldId("birth-year")} name="birthYear" value={hardMatchForm.birthYear} onChange={(e) => setHardMatchForm((f) => ({ ...f, birthYear: e.target.value }))}>
                    <option value="">请选择</option>
                    {BIRTH_YEAR_OPTIONS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </label>
                <label>
                  <span>月份</span>
                  <select id={buildDashboardFieldId("birth-month")} name="birthMonth" value={hardMatchForm.birthMonth} onChange={(e) => setHardMatchForm((f) => ({ ...f, birthMonth: e.target.value }))}>
                    <option value="">请选择</option>
                    {MONTH_OPTIONS.map((m) => <option key={m} value={String(m)}>{m}</option>)}
                  </select>
                </label>
                <label>
                  <span>日期</span>
                  <select id={buildDashboardFieldId("birth-day")} name="birthDay" value={hardMatchForm.birthDay} onChange={(e) => setHardMatchForm((f) => ({ ...f, birthDay: e.target.value }))}>
                    <option value="">请选择</option>
                    {birthDayOptions.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>性别</legend>
              <div className="option-list">
                {HARD_MATCH_GENDERS.map((g, i) => (
                  <label key={g}>
                    <input checked={hardMatchForm.gender === g} id={buildDashboardFieldId("gender", i)} type="radio" name="gender" onChange={() => setHardMatchForm((f) => ({ ...f, gender: g }))} />
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
                    <input checked={hardMatchForm.looks === l} id={buildDashboardFieldId("looks", i)} type="radio" name="looks" onChange={() => setHardMatchForm((f) => ({ ...f, looks: l }))} />
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
                onChange={(e) => setHardMatchForm((f) => ({ ...f, heightCm: e.target.value }))}
              >
                <option value="">请选择</option>
                {HEIGHT_OPTIONS.map((h) => <option key={h} value={String(h)}>{h} cm</option>)}
              </select>
            </fieldset>

            <fieldset className="question-block">
              <legend>显示昵称</legend>
              <label className="dash-one-liner-label">
                <span className="dashboard-muted">其他用户会看到你的昵称。</span>
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
                <span className="dashboard-muted">用一两句话介绍你自己；双方成功引荐后，对方会在邮件中看到这段文字。</span>
                <textarea
                  id={buildDashboardFieldId("one-liner-intro")}
                  name="oneLinerIntro"
                  rows={3}
                  maxLength={200}
                  value={hardMatchForm.oneLinerIntro}
                  onChange={(e) => setHardMatchForm((f) => ({ ...f, oneLinerIntro: e.target.value }))}
                  placeholder="例如：计算机系研究生，喜欢徒步和志愿者活动，希望遇到聊得来的朋友。"
                />
              </label>
            </fieldset>
          </div>
        </div>

        {/* ── 对方条件 ── */}
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-partner">TA</span>
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
                  <select id={buildDashboardFieldId("partner-age-min")} name="partnerAgeMin" value={hardMatchForm.partnerAgeMin} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerAgeMin: e.target.value }))}>
                    {AGE_OPTIONS.map((a) => <option key={a} value={String(a)}>{a}</option>)}
                  </select>
                </label>
                <label>
                  <span>年龄上限</span>
                  <select id={buildDashboardFieldId("partner-age-max")} name="partnerAgeMax" value={hardMatchForm.partnerAgeMax} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerAgeMax: e.target.value }))}>
                    {AGE_OPTIONS.map((a) => <option key={a} value={String(a)}>{a}</option>)}
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
                    <label key={g} className={active ? "chip active" : "chip"}>
                      <input checked={active} id={buildDashboardFieldId("partner-genders", i)} name="partnerGenders" type="checkbox" onChange={() => toggleHardSelection("partnerGenders", g)} />
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
                    <label key={l} className={active ? "chip active" : "chip"}>
                      <input checked={active} id={buildDashboardFieldId("partner-looks", i)} name="partnerLooks" type="checkbox" onChange={() => toggleHardSelection("partnerLooks", l)} />
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
                  <select id={buildDashboardFieldId("partner-height-min")} name="partnerHeightMin" value={hardMatchForm.partnerHeightMin} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerHeightMin: e.target.value }))}>
                    {HEIGHT_OPTIONS.map((h) => <option key={h} value={String(h)}>{h} cm</option>)}
                  </select>
                </label>
                <label>
                  <span>身高上限</span>
                  <select id={buildDashboardFieldId("partner-height-max")} name="partnerHeightMax" value={hardMatchForm.partnerHeightMax} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerHeightMax: e.target.value }))}>
                    {HEIGHT_OPTIONS.map((h) => <option key={h} value={String(h)}>{h} cm</option>)}
                  </select>
                </label>
              </div>
            </fieldset>
          </div>
        </div>

        {/* ── 价值观问卷 ── */}
        {questions.length > 0 && (
          <div className="dash-q-group">
            <div className="dash-q-group-header">
              <span className="dash-q-group-icon dash-q-group-icon-values">Q</span>
              <div>
                <h3>价值观问卷</h3>
                <p>共 {questions.length} 题，作为匹配算法的核心输入</p>
              </div>
            </div>
            <div className="question-list">
              {questions.map((question, questionIndex) => {
                const value = answers[question.key];
                const questionTitle = (
                  <div aria-hidden="true" className="question-block-title">
                    <span className="dash-q-num">{questionIndex + 1}</span>
                    <span>{question.prompt}</span>
                  </div>
                );

                if (question.type === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value : [];
                  const selectionLimit = question.selectionLimit ?? null;
                  const reachedSelectionLimit =
                    selectionLimit != null && selected.length >= selectionLimit;
                  return (
                    <fieldset key={question.id} className="question-block">
                      <legend className="question-block-legend">{question.prompt}</legend>
                      {questionTitle}
                      {selectionLimit != null ? (
                        <p className="dashboard-muted">本题最多选择 {selectionLimit} 项。</p>
                      ) : null}
                      <div className="chip-grid">
                        {question.options?.map((option, optionIndex) => {
                          const active = selected.includes(option.value);
                          return (
                            <label key={option.value} className={active ? "chip active" : "chip"}>
                              <input
                                checked={active}
                                disabled={!active && reachedSelectionLimit}
                                id={buildDashboardFieldId("question", question.id, optionIndex)}
                                name={question.key}
                                type="checkbox"
                                onChange={() =>
                                  setAnswers((current) => {
                                    const cur = Array.isArray(current[question.key]) ? (current[question.key] as string[]) : [];
                                    if (active) {
                                      return {
                                        ...current,
                                        [question.key]: cur.filter((v) => v !== option.value),
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
                                      [question.key]: [...cur, option.value],
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
                    <legend className="question-block-legend">{question.prompt}</legend>
                    {questionTitle}
                    <div className="option-list">
                      {question.options?.map((option, optionIndex) => (
                        <label key={option.value}>
                          <input
                            checked={value === option.value}
                            id={buildDashboardFieldId("question", question.id, optionIndex)}
                            type="radio"
                            name={question.key}
                            onChange={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}
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
