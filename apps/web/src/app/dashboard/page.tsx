"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../lib/api";

type Question = {
  id: string;
  key: string;
  prompt: string;
  type: "SCALE" | "SINGLE_SELECT" | "MULTI_SELECT" | "SHORT_TEXT";
  options?: string[];
};

type DashboardPayload = {
  profile: {
    fullName?: string | null;
    headline?: string | null;
    bio?: string | null;
    schoolYear?: string | null;
    programName?: string | null;
    ageMin?: number | null;
    ageMax?: number | null;
    allowCrossSchool?: boolean;
    preferCrossSchool?: boolean;
    languages?: string[] | null;
    interests?: string[] | null;
  } | null;
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

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function DashboardPage() {
  const [user, setUser] = useState<AuthPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    headline: "",
    bio: "",
    schoolYear: "",
    programName: "",
    ageMin: "18",
    ageMax: "30",
    allowCrossSchool: true,
    preferCrossSchool: false,
    languages: "",
    interests: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("骚扰");
  const [reportDetails, setReportDetails] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      setError(null);

      try {
        const [me, dashboardData, questionnaire, savedQuestionnaire] = await Promise.all([
          fetchApi<AuthPayload>("/auth/me"),
          fetchApi<DashboardPayload>("/me/dashboard"),
          fetchApi<QuestionnairePayload>("/questionnaire/current"),
          fetchApi<SavedQuestionnairePayload>("/me/questionnaire").catch(() => null),
        ]);

        if (!active) {
          return;
        }

        setUser(me);
        setDashboard(dashboardData);
        setQuestions(questionnaire.questions);
        setAnswers(savedQuestionnaire?.answers ?? {});
        setProfileForm({
          fullName: dashboardData.profile?.fullName ?? "",
          headline: dashboardData.profile?.headline ?? "",
          bio: dashboardData.profile?.bio ?? "",
          schoolYear: dashboardData.profile?.schoolYear ?? "",
          programName: dashboardData.profile?.programName ?? "",
          ageMin: String(dashboardData.profile?.ageMin ?? 18),
          ageMax: String(dashboardData.profile?.ageMax ?? 30),
          allowCrossSchool: dashboardData.profile?.allowCrossSchool ?? true,
          preferCrossSchool: dashboardData.profile?.preferCrossSchool ?? false,
          languages: (dashboardData.profile?.languages ?? []).join(", "),
          interests: (dashboardData.profile?.interests ?? []).join(", "),
        });
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Dashboard 加载失败。",
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

  async function saveProfile() {
    setSaving("profile");
    setSavedMessage(null);
    try {
      await fetchApi("/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          fullName: profileForm.fullName,
          headline: profileForm.headline,
          bio: profileForm.bio,
          schoolYear: profileForm.schoolYear,
          programName: profileForm.programName,
          ageMin: Number(profileForm.ageMin),
          ageMax: Number(profileForm.ageMax),
          allowCrossSchool: profileForm.allowCrossSchool,
          preferCrossSchool: profileForm.preferCrossSchool,
          languages: splitCsv(profileForm.languages),
          interests: splitCsv(profileForm.interests),
        }),
      });

      startTransition(() => {
        setSavedMessage("资料已保存。");
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "资料保存失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  async function saveQuestionnaire() {
    setSaving("questionnaire");
    setSavedMessage(null);
    try {
      await fetchApi("/me/questionnaire", {
        method: "PUT",
        body: JSON.stringify({ answers }),
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
      setSavedMessage(nextValue ? "你已加入本周轮次。" : "你已退出本周轮次。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "轮次状态更新失败。",
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
          details: reportDetails,
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
      setSavedMessage("举报已提交，系统已将该对象从你后续轮次里隔离。");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "举报提交失败。",
      );
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <main className="page-shell prose-shell">
        <section className="content-panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p className="eyebrow">Dashboard</p>
          <h1>正在加载你的轮次信息...</h1>
        </section>
      </main>
    );
  }

  if (error && !dashboard) {
    return (
      <main className="page-shell prose-shell">
        <section className="content-panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p className="eyebrow">Dashboard</p>
          <h1>现在还进不去。</h1>
          <p>{error}</p>
          <Link className="button-primary" href="/login">
            去登录
          </Link>
        </section>
      </main>
    );
  }

  const isOptedIn = dashboard?.currentCycle?.participationStatus === "OPTED_IN";

  return (
    <main className="page-shell dashboard-shell">
      <section className="content-panel">
        <p className="eyebrow">Dashboard</p>
        <h1>欢迎回来，{user?.displayName ?? "你"}。</h1>
        <p>本页负责三件事：更新资料、填写问卷、决定本周是否参与。</p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="dashboard-grid">
        <article className="content-panel">
          <p className="eyebrow">Current cycle</p>
          <h2>{dashboard?.currentCycle?.codename ?? "暂无开放轮次"}</h2>
          <p>
            揭晓时间：
            {dashboard?.currentCycle
              ? new Intl.DateTimeFormat("zh-CN", {
                  dateStyle: "long",
                  timeStyle: "short",
                  timeZone: "Asia/Shanghai",
                }).format(new Date(dashboard.currentCycle.revealAt))
              : "待配置"}
          </p>
          {dashboard?.currentCycle ? (
            <div className="dashboard-inline">
              <span>
                当前状态：
                <strong
                  style={{
                    background: isOptedIn ? "var(--sage-soft)" : "var(--accent-soft)",
                    color: isOptedIn ? "var(--sage)" : "var(--accent-text)",
                  }}
                >
                  {isOptedIn ? "已加入" : "未加入"}
                </strong>
              </span>
              <button
                className={isOptedIn ? "button-secondary" : "button-primary"}
                disabled={saving === "participation"}
                onClick={() => toggleParticipation(!isOptedIn)}
              >
                {isOptedIn ? "退出本周轮次" : "加入本周轮次"}
              </button>
            </div>
          ) : null}
        </article>

        <article className="content-panel">
          <p className="eyebrow">Latest match</p>
          {counterpart ? (
            <>
              <h2>{counterpart.displayName ?? "匿名对象"}</h2>
              <p style={{ margin: "0.2rem 0 0" }}>
                {counterpart.schoolName ?? "未识别学校"}
                {counterpart.headline ? ` · ${counterpart.headline}` : ""}
              </p>
              {dashboard?.latestMatch?.introducedAt && counterpart.email ? (
                <p className="form-success" style={{ marginTop: "0.75rem" }}>
                  已引荐，对方邮箱：{counterpart.email}
                </p>
              ) : null}
              <ul className="reason-list">
                {dashboard?.latestMatch?.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className="auth-actions">
                {dashboard?.latestMatch?.introducedAt ? (
                  <span className="domain-chip">已引荐</span>
                ) : (
                  <button
                    className="button-primary"
                    disabled={saving === "contact"}
                    onClick={() => void requestContact()}
                  >
                    {saving === "contact" ? "发送中..." : "联系 TA"}
                  </button>
                )}
                {dashboard?.latestMatch?.reportStatus ? (
                  <span className="domain-chip">举报处理中</span>
                ) : (
                  <button
                    className="button-secondary"
                    disabled={saving === "report"}
                    onClick={() => setReportOpen((current) => !current)}
                  >
                    举报 TA
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
                    <span>补充说明</span>
                    <textarea
                      rows={3}
                      value={reportDetails}
                      onChange={(event) => setReportDetails(event.target.value)}
                    />
                  </label>
                  <button
                    className="button-primary"
                    disabled={saving === "report"}
                    onClick={() => void submitReport()}
                  >
                    {saving === "report" ? "提交中..." : "确认举报"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h2>本周还没有揭晓。</h2>
              <p>等轮次进入 reveal 后，你会在这里看到对象和匹配理由。</p>
            </>
          )}
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="content-panel">
          <p className="eyebrow">Profile</p>
          <h2>资料</h2>
          <div className="form-grid">
            <label>
              <span>真实姓名</span>
              <input
                value={profileForm.fullName}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>一句话介绍</span>
              <input
                value={profileForm.headline}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    headline: event.target.value,
                  }))
                }
              />
            </label>
            <label className="full-span">
              <span>简介</span>
              <textarea
                rows={4}
                value={profileForm.bio}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    bio: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>年级</span>
              <input
                value={profileForm.schoolYear}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    schoolYear: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>项目 / 专业</span>
              <input
                value={profileForm.programName}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    programName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>偏好年龄下限</span>
              <input
                type="number"
                value={profileForm.ageMin}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    ageMin: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>偏好年龄上限</span>
              <input
                type="number"
                value={profileForm.ageMax}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    ageMax: event.target.value,
                  }))
                }
              />
            </label>
            <label className="full-span">
              <span>语言（逗号分隔）</span>
              <input
                value={profileForm.languages}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    languages: event.target.value,
                  }))
                }
              />
            </label>
            <label className="full-span">
              <span>兴趣（逗号分隔）</span>
              <input
                value={profileForm.interests}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    interests: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input
                checked={profileForm.allowCrossSchool}
                type="checkbox"
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    allowCrossSchool: event.target.checked,
                  }))
                }
              />
              <span>允许跨校匹配</span>
            </label>
            <label>
              <input
                checked={profileForm.preferCrossSchool}
                type="checkbox"
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    preferCrossSchool: event.target.checked,
                  }))
                }
              />
              <span>偏好跨校</span>
            </label>
          </div>

          <button
            className="button-primary"
            disabled={saving === "profile"}
            onClick={() => void saveProfile()}
          >
            {saving === "profile" ? "保存中..." : "保存资料"}
          </button>
        </article>

        <article className="content-panel">
          <p className="eyebrow">Questionnaire</p>
          <h2>问卷</h2>
          <div className="question-list">
            {questions.map((question) => {
              const value = answers[question.key];

              if (question.type === "SHORT_TEXT") {
                return (
                  <label key={question.id} className="question-block">
                    <span>{question.prompt}</span>
                    <textarea
                      rows={3}
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [question.key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                );
              }

              if (question.type === "MULTI_SELECT") {
                const selected = Array.isArray(value) ? value : [];

                return (
                  <fieldset key={question.id} className="question-block">
                    <legend>{question.prompt}</legend>
                    <div className="chip-grid">
                      {question.options?.map((option) => {
                        const active = selected.includes(option);

                        return (
                          <label key={option} className={active ? "chip active" : "chip"}>
                            <input
                              checked={active}
                              type="checkbox"
                              onChange={() =>
                                setAnswers((current) => {
                                  const currentValues = Array.isArray(current[question.key])
                                    ? (current[question.key] as string[])
                                    : [];

                                  return {
                                    ...current,
                                    [question.key]: active
                                      ? currentValues.filter((item) => item !== option)
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
            onClick={() => void saveQuestionnaire()}
            style={{ marginTop: "1rem" }}
          >
            {saving === "questionnaire" ? "保存中..." : "保存问卷"}
          </button>
        </article>
      </section>
    </main>
  );
}
