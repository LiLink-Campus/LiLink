"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdmin } from "../admin-context";
import type {
  AdminQuestion,
  AdminQuestionOption,
  AdminQuestionReasonRule,
} from "../types";

type QuestionnairePayload = {
  id: string;
  title: string;
  description: string | null;
  questions: AdminQuestion[];
};

type QuestionEditorState = {
  questionId: string;
  key: string;
  prompt: string;
  type: AdminQuestion["type"];
  options: AdminQuestionOption[];
  reasonRules: AdminQuestionReasonRule[];
  order: number;
  weight: number;
};

const QUESTION_TYPE_LABELS: Record<AdminQuestion["type"], string> = {
  SINGLE_SELECT: "单选",
  MULTI_SELECT: "多选",
  SCALE: "量表",
};

const REASON_RULE_LABELS: Record<AdminQuestionReasonRule["type"], string> = {
  EXACT_MATCH: "完全一致",
  MULTI_OVERLAP: "重叠项命中",
};

function createEmptyOption(): AdminQuestionOption {
  return {
    value: "",
    label: "",
  };
}

function createEmptyReasonRule(
  questionType: AdminQuestion["type"],
): AdminQuestionReasonRule {
  if (questionType === "MULTI_SELECT") {
    return {
      type: "MULTI_OVERLAP",
      template: "",
      priority: 1,
      minOverlap: 1,
      maxLabels: 2,
    };
  }

  return {
    type: "EXACT_MATCH",
    template: "",
    priority: 1,
  };
}

function createEmptyQuestion(): QuestionEditorState {
  return {
    questionId: "",
    key: "",
    prompt: "",
    type: "SINGLE_SELECT" as AdminQuestion["type"],
    options: [createEmptyOption(), createEmptyOption()],
    reasonRules: [],
    order: 1,
    weight: 1,
  };
}

export default function AdminQuestionnairePage() {
  const { authenticated } = useAdmin();
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | AdminQuestion["type"]>(
    "ALL",
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState<QuestionEditorState>(createEmptyQuestion);

  const loadQuestionnaire = useCallback(async () => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await fetchApi<QuestionnairePayload>(
        "/admin/questionnaire",
      );
      setQuestions(payload.questions ?? []);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "问卷加载失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    void loadQuestionnaire();
  }, [loadQuestionnaire]);

  const sortedQuestions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return [...questions]
      .sort((left, right) => left.order - right.order)
      .filter((question) => {
        if (typeFilter !== "ALL" && question.type !== typeFilter) {
          return false;
        }

        if (!keyword) {
          return true;
        }

        return [question.key, question.prompt, question.type]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [questions, search, typeFilter]);

  useEffect(() => {
    if (!sortedQuestions.length) {
      setSelectedQuestionId(null);
      setForm(createEmptyQuestion());
      return;
    }

    if (
      !selectedQuestionId ||
      !sortedQuestions.some((question) => question.id === selectedQuestionId)
    ) {
      setSelectedQuestionId(sortedQuestions[0].id);
    }
  }, [sortedQuestions, selectedQuestionId]);

  const selectedQuestion =
    sortedQuestions.find((question) => question.id === selectedQuestionId) ??
    null;

  useEffect(() => {
    if (!selectedQuestion) {
      return;
    }

    setForm({
      questionId: selectedQuestion.id,
      key: selectedQuestion.key,
      prompt: selectedQuestion.prompt,
      type: selectedQuestion.type,
      options: Array.isArray(selectedQuestion.options)
        ? selectedQuestion.options.map((option) => ({ ...option }))
        : [createEmptyOption(), createEmptyOption()],
      reasonRules: Array.isArray(selectedQuestion.reasonRules)
        ? selectedQuestion.reasonRules.map((rule) => ({ ...rule }))
        : [],
      order: selectedQuestion.order,
      weight: selectedQuestion.weight,
    });
  }, [selectedQuestion]);

  function resetForm() {
    setSelectedQuestionId(null);
    setForm({
      ...createEmptyQuestion(),
      order: sortedQuestions.length + 1,
    });
  }

  function cloneQuestion(question: AdminQuestion) {
    setSelectedQuestionId(null);
    setForm({
      questionId: "",
      key: `${question.key}_copy`,
      prompt: question.prompt,
      type: question.type,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({ ...option }))
        : [createEmptyOption(), createEmptyOption()],
      reasonRules: Array.isArray(question.reasonRules)
        ? question.reasonRules.map((rule) => ({ ...rule }))
        : [],
      order: sortedQuestions.length + 1,
      weight: question.weight,
    });
  }

  async function reorderQuestions(questionIds: string[]) {
    setPending("reorder");
    setError(null);

    try {
      await fetchApi("/admin/questionnaire/questions/reorder", {
        method: "POST",
        body: JSON.stringify({
          questionIds,
        }),
      });
      await loadQuestionnaire();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "题目排序失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function moveQuestion(questionId: string, direction: "up" | "down") {
    const orderedIds = [...questions]
      .sort((left, right) => left.order - right.order)
      .map((question) => question.id);
    const currentIndex = orderedIds.indexOf(questionId);
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (
      currentIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= orderedIds.length
    ) {
      return;
    }

    [orderedIds[currentIndex], orderedIds[targetIndex]] = [
      orderedIds[targetIndex],
      orderedIds[currentIndex],
    ];

    await reorderQuestions(orderedIds);
  }

  function exportQuestions() {
    const blob = new Blob([JSON.stringify(questions, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "questionnaire.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setError(null);

    const cleanOptions = form.options
      .map((option) => ({
        value: option.value.trim() || option.label.trim(),
        label: option.label.trim(),
      }))
      .filter((option) => option.label);

    const cleanReasonRules = form.reasonRules
      .map((rule) => ({
        type: rule.type,
        template: rule.template.trim(),
        priority: rule.priority,
        ...(rule.type === "MULTI_OVERLAP"
          ? {
              minOverlap: rule.minOverlap,
              maxLabels: rule.maxLabels,
            }
          : {}),
      }))
      .filter((rule) => rule.template);

    if (cleanOptions.length < 2) {
      setError("可选题至少需要两个选项。");
      setPending(null);
      return;
    }

    try {
      await fetchApi("/admin/questionnaire/questions", {
        method: "PUT",
        body: JSON.stringify({
          questionId: form.questionId || undefined,
          key: form.key,
          prompt: form.prompt,
          type: form.type,
          options: cleanOptions,
          reasonRules: cleanReasonRules,
          order: form.order,
          weight: form.weight,
        }),
      });
      await loadQuestionnaire();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "题目保存失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function deleteQuestion(questionId: string) {
    setPending(`delete-${questionId}`);
    setError(null);

    try {
      await fetchApi(`/admin/questionnaire/questions/${questionId}`, {
        method: "DELETE",
      });
      await loadQuestionnaire();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "题目删除失败。",
      );
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载问卷构建器...</div>;
  }

  return (
    <div
      className="admin-page admin-page-stack"
      style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}
    >
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
            问卷构建器
          </h1>
          <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>
            把题目列表、编辑器和预览放在同一个工作区里，减少来回切换。
          </p>
        </div>
        <div className="auth-actions">
          <button
            className="button-secondary"
            onClick={resetForm}
            type="button"
            style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}
          >
            新建题目
          </button>
          <button
            className="button-secondary"
            onClick={() => void loadQuestionnaire()}
            type="button"
            style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}
          >
            刷新
          </button>
          <button
            className="button-secondary"
            onClick={exportQuestions}
            type="button"
            style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}
          >
            导出 JSON
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="admin-workspace-grid">
        <article className="content-panel admin-list-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">题目</p>
              <h2>题目列表</h2>
            </div>
          </div>
          <div className="admin-search-bar">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索题目 key、题干或题型"
            />
          </div>
          <div className="admin-tabs">
            {(["ALL", "SINGLE_SELECT", "MULTI_SELECT", "SCALE"] as const).map(
              (type) => (
                <button
                  key={type}
                  type="button"
                  className={
                    typeFilter === type ? "admin-tab active" : "admin-tab"
                  }
                  onClick={() => setTypeFilter(type)}
                >
                  {type === "ALL" ? "全部" : QUESTION_TYPE_LABELS[type]}
                </button>
              ),
            )}
          </div>
          <div className="admin-record-list">
            {sortedQuestions.map((question) => (
              <button
                key={question.id}
                type="button"
                className={
                  question.id === selectedQuestionId
                    ? "admin-record-item admin-record-item-active"
                    : "admin-record-item"
                }
                onClick={() => setSelectedQuestionId(question.id)}
              >
                <div className="admin-record-topline">
                  <strong>
                    {question.order}. {question.prompt}
                  </strong>
                  <span className="domain-chip">
                    {QUESTION_TYPE_LABELS[question.type]}
                  </span>
                </div>
                <p>{question.key}</p>
                <div className="admin-inline-meta">
                  <span>权重 {question.weight}</span>
                  <span>
                    {Array.isArray(question.options)
                      ? `${question.options.length} 个选项`
                      : "未配置选项"}
                  </span>
                  <span>
                    {Array.isArray(question.reasonRules)
                      ? `${question.reasonRules.length} 条理由规则`
                      : "无理由规则"}
                  </span>
                </div>
              </button>
            ))}
            {sortedQuestions.length === 0 ? (
              <div className="admin-empty-state">当前问卷还没有题目。</div>
            ) : null}
          </div>
        </article>

        <article className="content-panel admin-detail-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">编辑</p>
              <h2>{form.questionId ? "编辑题目" : "新增题目"}</h2>
            </div>
            {selectedQuestion ? (
              <div className="auth-actions">
                <button
                  className="button-secondary"
                  onClick={() => void moveQuestion(selectedQuestion.id, "up")}
                  type="button"
                  disabled={
                    pending === "reorder" || selectedQuestion.order === 1
                  }
                >
                  上移
                </button>
                <button
                  className="button-secondary"
                  onClick={() => void moveQuestion(selectedQuestion.id, "down")}
                  type="button"
                  disabled={
                    pending === "reorder" ||
                    selectedQuestion.order === questions.length
                  }
                >
                  下移
                </button>
                <button
                  className="button-secondary"
                  onClick={() => cloneQuestion(selectedQuestion)}
                  type="button"
                >
                  复制题目
                </button>
                <button
                  className="button-ghost"
                  onClick={() => void deleteQuestion(selectedQuestion.id)}
                  type="button"
                  disabled={pending === `delete-${selectedQuestion.id}`}
                >
                  {pending === `delete-${selectedQuestion.id}`
                    ? "删除中..."
                    : "删除题目"}
                </button>
              </div>
            ) : null}
          </div>

          <form className="auth-form" onSubmit={saveQuestion}>
            <div className="form-grid">
              <label>
                <span>题目 Key</span>
                <input
                  required
                  value={form.key}
                  disabled={Boolean(form.questionId)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>题型</span>
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as AdminQuestion["type"],
                    }))
                  }
                >
                  <option value="SINGLE_SELECT">单选</option>
                  <option value="MULTI_SELECT">多选</option>
                  <option value="SCALE">量表</option>
                </select>
              </label>
            </div>

            <label>
              <span>题目内容</span>
              <textarea
                rows={3}
                value={form.prompt}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
              />
            </label>

            <div className="admin-page-stack">
              <span className="admin-field-label">选项</span>
              {form.options.map((option, index) => (
                <div
                  key={`${form.questionId || "new"}-${index}`}
                  className="admin-page-stack"
                  style={{
                    padding: "1rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "1rem",
                  }}
                >
                  <div className="form-grid">
                    <label>
                      <span>显示文案</span>
                      <input
                        value={option.label}
                        onChange={(event) => {
                          const nextLabel = event.target.value;
                          setForm((current) => {
                            const nextOptions = [...current.options];
                            const previousOption = nextOptions[index];
                            nextOptions[index] = {
                              ...previousOption,
                              label: nextLabel,
                              value:
                                previousOption.value.trim().length === 0
                                  ? nextLabel
                                  : previousOption.value,
                            };
                            return {
                              ...current,
                              options: nextOptions,
                            };
                          });
                        }}
                        placeholder={`选项 ${index + 1} 的显示文案`}
                      />
                    </label>
                    <label>
                      <span>稳定值</span>
                      <input
                        value={option.value}
                        onChange={(event) =>
                          setForm((current) => {
                            const nextOptions = [...current.options];
                            nextOptions[index] = {
                              ...nextOptions[index],
                              value: event.target.value,
                            };
                            return {
                              ...current,
                              options: nextOptions,
                            };
                          })
                        }
                        placeholder={`option_${index + 1}`}
                      />
                    </label>
                  </div>
                  {form.options.length > 2 ? (
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          options: current.options.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        }))
                      }
                    >
                      移除
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                className="button-secondary"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    options: [...current.options, createEmptyOption()],
                  }))
                }
              >
                添加选项
              </button>
            </div>

            <div className="admin-page-stack">
              <div className="admin-record-topline">
                <span className="admin-field-label">理由规则</span>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      reasonRules: [
                        ...current.reasonRules,
                        createEmptyReasonRule(current.type),
                      ],
                    }))
                  }
                >
                  添加理由规则
                </button>
              </div>
              {form.reasonRules.length === 0 ? (
                <p style={{ color: "var(--fg-secondary)" }}>
                  这道题目前不会生成匹配理由，只参与打分。
                </p>
              ) : null}
              {form.reasonRules.map((rule, index) => (
                <div
                  key={`${form.questionId || "new"}-rule-${index}`}
                  className="admin-page-stack"
                  style={{
                    padding: "1rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "1rem",
                  }}
                >
                  <div className="form-grid">
                    <label>
                      <span>规则类型</span>
                      <select
                        value={rule.type}
                        onChange={(event) =>
                          setForm((current) => {
                            const nextRules = [...current.reasonRules];
                            const nextType =
                              event.target.value as AdminQuestionReasonRule["type"];
                            nextRules[index] =
                              nextType === "MULTI_OVERLAP"
                                ? {
                                    type: nextType,
                                    template: nextRules[index].template,
                                    priority: nextRules[index].priority,
                                    minOverlap:
                                      "minOverlap" in nextRules[index]
                                        ? nextRules[index].minOverlap
                                        : 1,
                                    maxLabels:
                                      "maxLabels" in nextRules[index]
                                        ? nextRules[index].maxLabels
                                        : 2,
                                  }
                                : {
                                    type: nextType,
                                    template: nextRules[index].template,
                                    priority: nextRules[index].priority,
                                  };
                            return {
                              ...current,
                              reasonRules: nextRules,
                            };
                          })
                        }
                      >
                        <option value="EXACT_MATCH">
                          {REASON_RULE_LABELS.EXACT_MATCH}
                        </option>
                        <option value="MULTI_OVERLAP">
                          {REASON_RULE_LABELS.MULTI_OVERLAP}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>优先级</span>
                      <input
                        type="number"
                        min={0}
                        value={rule.priority ?? 0}
                        onChange={(event) =>
                          setForm((current) => {
                            const nextRules = [...current.reasonRules];
                            nextRules[index] = {
                              ...nextRules[index],
                              priority: Number(event.target.value),
                            };
                            return {
                              ...current,
                              reasonRules: nextRules,
                            };
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>模板</span>
                    <textarea
                      rows={3}
                      value={rule.template}
                      onChange={(event) =>
                        setForm((current) => {
                          const nextRules = [...current.reasonRules];
                          nextRules[index] = {
                            ...nextRules[index],
                            template: event.target.value,
                          };
                          return {
                            ...current,
                            reasonRules: nextRules,
                          };
                        })
                      }
                      placeholder={
                        rule.type === "MULTI_OVERLAP"
                          ? "例如：你们都把 {{labels_2}} 放在重要位置。"
                          : "例如：你们对关系推进节奏的期待很接近。"
                      }
                    />
                  </label>
                  {rule.type === "MULTI_OVERLAP" ? (
                    <div className="form-grid">
                      <label>
                        <span>最少命中数</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.minOverlap ?? 1}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextRules = [...current.reasonRules];
                              nextRules[index] = {
                                ...nextRules[index],
                                minOverlap: Number(event.target.value),
                              };
                              return {
                                ...current,
                                reasonRules: nextRules,
                              };
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>最多展示标签数</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.maxLabels ?? 2}
                          onChange={(event) =>
                            setForm((current) => {
                              const nextRules = [...current.reasonRules];
                              nextRules[index] = {
                                ...nextRules[index],
                                maxLabels: Number(event.target.value),
                              };
                              return {
                                ...current,
                                reasonRules: nextRules,
                              };
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  <button
                    className="button-ghost"
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        reasonRules: current.reasonRules.filter(
                          (_, ruleIndex) => ruleIndex !== index,
                        ),
                      }))
                    }
                  >
                    移除规则
                  </button>
                </div>
              ))}
            </div>

            <div className="form-grid">
              <label>
                <span>排序</span>
                <input
                  type="number"
                  min={1}
                  value={form.order}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      order: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>权重</span>
                <input
                  type="number"
                  min={1}
                  value={form.weight}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weight: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <button
              className="button-primary"
              type="submit"
              disabled={pending === "save"}
            >
              {pending === "save"
                ? "保存中..."
                : form.questionId
                  ? "保存题目"
                  : "创建题目"}
            </button>
          </form>
        </article>
      </section>

      <section className="content-panel">
        <div className="admin-section-header">
          <div>
            <p className="eyebrow">预览</p>
            <h2>问卷预览</h2>
          </div>
        </div>
        <div className="admin-question-preview-list">
          {sortedQuestions.map((question) => (
            <article key={question.id} className="admin-question-preview-card">
              <div className="admin-record-topline">
                <strong>
                  {question.order}. {question.prompt}
                </strong>
                <span className="domain-chip">
                  {QUESTION_TYPE_LABELS[question.type]}
                </span>
              </div>
              {Array.isArray(question.options) &&
              question.options.length > 0 ? (
                <ul>
                  {question.options.map((option) => (
                    <li key={option.value}>
                      {option.label}
                      <span style={{ color: "var(--fg-secondary)" }}>
                        {" "}
                        ({option.value})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂未配置选项</p>
              )}
              {Array.isArray(question.reasonRules) &&
              question.reasonRules.length > 0 ? (
                <ul>
                  {question.reasonRules.map((rule, index) => (
                    <li key={`${question.id}-rule-${index}`}>
                      {REASON_RULE_LABELS[rule.type]}：{rule.template}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>当前没有理由规则。</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
