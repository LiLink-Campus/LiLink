"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdmin } from "../admin-context";
import type { AdminQuestion } from "../types";

type QuestionnairePayload = {
  id: string;
  title: string;
  description: string | null;
  questions: AdminQuestion[];
};

const QUESTION_TYPE_LABELS: Record<AdminQuestion["type"], string> = {
  SINGLE_SELECT: "单选",
  MULTI_SELECT: "多选",
  SCALE: "量表",
  SHORT_TEXT: "文本",
};

function createEmptyQuestion() {
  return {
    questionId: "",
    key: "",
    prompt: "",
    type: "SINGLE_SELECT" as AdminQuestion["type"],
    options: ["", ""],
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
  const [typeFilter, setTypeFilter] = useState<"ALL" | AdminQuestion["type"]>("ALL");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [form, setForm] = useState(createEmptyQuestion);

  const loadQuestionnaire = useCallback(async () => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await fetchApi<QuestionnairePayload>("/admin/questionnaire");
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

    if (!selectedQuestionId || !sortedQuestions.some((question) => question.id === selectedQuestionId)) {
      setSelectedQuestionId(sortedQuestions[0].id);
    }
  }, [sortedQuestions, selectedQuestionId]);

  const selectedQuestion = sortedQuestions.find((question) => question.id === selectedQuestionId) ?? null;

  useEffect(() => {
    if (!selectedQuestion) {
      return;
    }

    setForm({
      questionId: selectedQuestion.id,
      key: selectedQuestion.key,
      prompt: selectedQuestion.prompt,
      type: selectedQuestion.type,
      options: Array.isArray(selectedQuestion.options) ? [...selectedQuestion.options] : ["", ""],
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
      options: Array.isArray(question.options) ? [...question.options] : ["", ""],
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
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= orderedIds.length) {
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

    const cleanOptions = form.options.map((option) => option.trim()).filter(Boolean);
    const requiresOptions = form.type !== "SHORT_TEXT";

    if (requiresOptions && cleanOptions.length < 2) {
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
          options: requiresOptions ? cleanOptions : undefined,
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
    <div className="admin-page admin-page-stack">
      <div className="admin-page-header">
        <div>
          <h1>问卷构建器</h1>
          <p>把题目列表、编辑器和预览放在同一个工作区里，减少来回切换。</p>
        </div>
        <div className="auth-actions">
          <button className="button-secondary" onClick={resetForm} type="button">
            新建题目
          </button>
          <button className="button-secondary" onClick={() => void loadQuestionnaire()} type="button">
            刷新
          </button>
          <button className="button-secondary" onClick={exportQuestions} type="button">
            导出 JSON
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="admin-workspace-grid">
        <article className="content-panel admin-list-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">Questions</p>
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
          <div className="admin-filter-row">
            {(["ALL", "SINGLE_SELECT", "MULTI_SELECT", "SCALE", "SHORT_TEXT"] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={typeFilter === type ? "button-primary" : "button-secondary"}
                onClick={() => setTypeFilter(type)}
              >
                {type === "ALL" ? "全部" : QUESTION_TYPE_LABELS[type]}
              </button>
            ))}
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
                  <span className="domain-chip">{QUESTION_TYPE_LABELS[question.type]}</span>
                </div>
                <p>{question.key}</p>
                <div className="admin-inline-meta">
                  <span>权重 {question.weight}</span>
                  <span>
                    {Array.isArray(question.options) ? `${question.options.length} 个选项` : "文本题"}
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
              <p className="eyebrow">Editor</p>
              <h2>{form.questionId ? "编辑题目" : "新增题目"}</h2>
            </div>
            {selectedQuestion ? (
              <div className="auth-actions">
                <button
                  className="button-secondary"
                  onClick={() => void moveQuestion(selectedQuestion.id, "up")}
                  type="button"
                  disabled={pending === "reorder" || selectedQuestion.order === 1}
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
                <button className="button-secondary" onClick={() => cloneQuestion(selectedQuestion)} type="button">
                  复制题目
                </button>
                <button
                  className="button-ghost"
                  onClick={() => void deleteQuestion(selectedQuestion.id)}
                  type="button"
                  disabled={pending === `delete-${selectedQuestion.id}`}
                >
                  {pending === `delete-${selectedQuestion.id}` ? "删除中..." : "删除题目"}
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
                  onChange={(event) =>
                    setForm((current) => ({ ...current, key: event.target.value }))
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
                  <option value="SHORT_TEXT">文本</option>
                </select>
              </label>
            </div>

            <label>
              <span>题目内容</span>
              <textarea
                rows={3}
                value={form.prompt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prompt: event.target.value }))
                }
              />
            </label>

            {form.type === "SHORT_TEXT" ? (
              <div className="admin-empty-state">文本题不需要预设选项。</div>
            ) : (
              <div className="admin-page-stack">
                <span className="admin-field-label">选项</span>
                {form.options.map((option, index) => (
                  <div key={`${form.questionId || "new"}-${index}`} className="admin-inline-form">
                    <input
                      value={option}
                      onChange={(event) => {
                        const nextOptions = [...form.options];
                        nextOptions[index] = event.target.value;
                        setForm((current) => ({ ...current, options: nextOptions }));
                      }}
                      placeholder={`选项 ${index + 1}`}
                    />
                    {form.options.length > 2 ? (
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            options: current.options.filter((_, currentIndex) => currentIndex !== index),
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
                      options: [...current.options, ""],
                    }))
                  }
                >
                  添加选项
                </button>
              </div>
            )}

            <div className="form-grid">
              <label>
                <span>排序</span>
                <input
                  type="number"
                  min={1}
                  value={form.order}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, order: Number(event.target.value) }))
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
                    setForm((current) => ({ ...current, weight: Number(event.target.value) }))
                  }
                />
              </label>
            </div>

            <button className="button-primary" type="submit" disabled={pending === "save"}>
              {pending === "save" ? "保存中..." : form.questionId ? "保存题目" : "创建题目"}
            </button>
          </form>
        </article>
      </section>

      <section className="content-panel">
        <div className="admin-section-header">
          <div>
            <p className="eyebrow">Preview</p>
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
                <span className="domain-chip">{QUESTION_TYPE_LABELS[question.type]}</span>
              </div>
              {Array.isArray(question.options) && question.options.length > 0 ? (
                <ul>
                  {question.options.map((option) => (
                    <li key={option}>{option}</li>
                  ))}
                </ul>
              ) : (
                <p>自由文本回答</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
