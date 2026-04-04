"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchApi } from "../../../lib/api";
import { useAdmin } from "../admin-context";
import type {
  AdminQuestion,
  AdminQuestionReasonRule,
} from "../types";

type QuestionnairePayload = {
  id: string;
  title: string;
  description: string | null;
  questions: AdminQuestion[];
};

type QuestionOptionFormState = {
  label: string;
};

type QuestionFormState = {
  questionId: string;
  key: string;
  prompt: string;
  type: AdminQuestion["type"];
  selectionLimit: string;
  options: QuestionOptionFormState[];
  reasonRules: AdminQuestionReasonRule[];
  order: number;
  weight: number;
};

const TYPE_LABELS: Record<AdminQuestion["type"], string> = {
  SINGLE_SELECT: "单选",
  MULTI_SELECT: "多选",
  SCALE: "量表",
};

const TYPE_COLORS: Record<
  AdminQuestion["type"],
  { bg: string; text: string }
> = {
  SINGLE_SELECT: { bg: "var(--accent-soft)", text: "var(--accent-text)" },
  MULTI_SELECT: { bg: "var(--sage-soft)", text: "var(--sage)" },
  SCALE: { bg: "var(--gold-soft)", text: "var(--gold)" },
};

const REASON_RULE_LABELS: Record<AdminQuestionReasonRule["type"], string> = {
  EXACT_MATCH: "完全一致",
  MULTI_OVERLAP: "重叠项命中",
};

function createEmptyOption(): QuestionOptionFormState {
  return { label: "" };
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
  return { type: "EXACT_MATCH", template: "", priority: 1 };
}

function createEmptyForm(order: number): QuestionFormState {
  return {
    questionId: "",
    key: "",
    prompt: "",
    type: "SINGLE_SELECT",
    selectionLimit: "",
    options: [createEmptyOption(), createEmptyOption()],
    reasonRules: [],
    order,
    weight: 1,
  };
}

function formFromQuestion(question: AdminQuestion): QuestionFormState {
  return {
    questionId: question.id,
    key: question.key,
    prompt: question.prompt,
    type: question.type,
    selectionLimit:
      question.selectionLimit == null ? "" : String(question.selectionLimit),
    options: Array.isArray(question.options)
      ? question.options.map((o) => ({ label: o.label }))
      : [createEmptyOption(), createEmptyOption()],
    reasonRules: Array.isArray(question.reasonRules)
      ? question.reasonRules.map((r) => ({ ...r }))
      : [],
    order: question.order,
    weight: question.weight,
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuestionFormState>(() =>
    createEmptyForm(1),
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const dragSourceRef = useRef<string | null>(null);
  const [isDraggingId, setIsDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">(
    "after",
  );

  const keyInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (editingId === "new") {
      keyInputRef.current?.focus();
    }
  }, [editingId]);

  const sortedQuestions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return [...questions]
      .sort((a, b) => a.order - b.order)
      .filter((q) => {
        if (typeFilter !== "ALL" && q.type !== typeFilter) return false;
        if (!keyword) return true;
        return [q.key, q.prompt, q.type]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [questions, search, typeFilter]);

  const isFiltered = search.trim() !== "" || typeFilter !== "ALL";

  const typeCounts = useMemo(() => {
    const counts = {
      ALL: questions.length,
      SINGLE_SELECT: 0,
      MULTI_SELECT: 0,
      SCALE: 0,
    };
    for (const q of questions) counts[q.type]++;
    return counts;
  }, [questions]);

  /* ── Editing lifecycle ─────────────────────────────── */

  function startEditing(question: AdminQuestion) {
    setEditingId(question.id);
    setForm(formFromQuestion(question));
    setShowAdvanced(
      (Array.isArray(question.reasonRules) &&
        question.reasonRules.length > 0) ||
        question.weight !== 1,
    );
  }

  function startCreating() {
    setEditingId("new");
    setForm(createEmptyForm(questions.length + 1));
    setShowAdvanced(false);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  function cloneQuestion(question: AdminQuestion) {
    setEditingId("new");
    setForm({
      ...formFromQuestion(question),
      questionId: "",
      key: `${question.key}_copy`,
      order: questions.length + 1,
    });
    setShowAdvanced(
      (Array.isArray(question.reasonRules) &&
        question.reasonRules.length > 0) ||
        question.weight !== 1,
    );
  }

  /* ── API calls ─────────────────────────────────────── */

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setError(null);

    const cleanOptions = form.options
      .map((o) => {
        const label = o.label.trim();
        return { value: label, label };
      })
      .filter((o) => o.label);

    const cleanRules = form.reasonRules
      .map((r) => ({
        type: r.type,
        template: r.template.trim(),
        priority: r.priority,
        ...(r.type === "MULTI_OVERLAP"
          ? { minOverlap: r.minOverlap, maxLabels: r.maxLabels }
          : {}),
      }))
      .filter((r) => r.template);

    const selectionLimit =
      form.type === "MULTI_SELECT" && form.selectionLimit.trim()
        ? Number(form.selectionLimit)
        : undefined;

    if (cleanOptions.length < 2) {
      setError("至少需要两个选项。");
      setPending(null);
      return;
    }

    if (
      form.type === "MULTI_SELECT" &&
      selectionLimit != null &&
      selectionLimit > cleanOptions.length
    ) {
      setError("多选题的最多可选数不能大于选项总数。");
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
          selectionLimit,
          options: cleanOptions,
          reasonRules: cleanRules,
          order: form.order,
          weight: form.weight,
        }),
      });
      setEditingId(null);
      await loadQuestionnaire();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "保存失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function deleteQuestion(questionId: string) {
    if (!confirm("确定删除这道题目？此操作不可撤回。")) return;
    setPending(`delete-${questionId}`);
    setError(null);
    try {
      await fetchApi(`/admin/questionnaire/questions/${questionId}`, {
        method: "DELETE",
      });
      if (editingId === questionId) setEditingId(null);
      await loadQuestionnaire();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "删除失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function reorderQuestions(questionIds: string[]) {
    setPending("reorder");
    setError(null);
    try {
      await fetchApi("/admin/questionnaire/questions/reorder", {
        method: "POST",
        body: JSON.stringify({ questionIds }),
      });
      await loadQuestionnaire();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "排序失败。",
      );
    } finally {
      setPending(null);
    }
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

  /* ── Drag-and-drop ─────────────────────────────────── */

  function handleDragStart(e: React.DragEvent, questionId: string) {
    dragSourceRef.current = questionId;
    setIsDraggingId(questionId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", questionId);
    const card = (e.currentTarget as HTMLElement).closest(
      ".qb-card",
    ) as HTMLElement | null;
    if (card) e.dataTransfer.setDragImage(card, 20, 20);
  }

  function handleDragOver(e: React.DragEvent, questionId: string) {
    if (!dragSourceRef.current || dragSourceRef.current === questionId) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropTargetId(questionId);
    setDropPosition(e.clientY < rect.top + rect.height / 2 ? "before" : "after");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const sourceId = dragSourceRef.current;
    if (!sourceId || !dropTargetId) return;

    const ordered = [...questions].sort((a, b) => a.order - b.order);
    const ids = ordered.map((q) => q.id);
    const fromIndex = ids.indexOf(sourceId);
    if (fromIndex === -1) return;
    ids.splice(fromIndex, 1);

    let toIndex = ids.indexOf(dropTargetId);
    if (toIndex === -1) return;
    if (dropPosition === "after") toIndex++;
    ids.splice(toIndex, 0, sourceId);

    void reorderQuestions(ids);
    cleanupDrag();
  }

  function handleDragEnd() {
    cleanupDrag();
  }

  function cleanupDrag() {
    dragSourceRef.current = null;
    setIsDraggingId(null);
    setDropTargetId(null);
  }

  /* ── Form field helpers ────────────────────────────── */

  function updateOptionLabel(index: number, newLabel: string) {
    setForm((f) => {
      const next = [...f.options];
      next[index] = { label: newLabel };
      return { ...f, options: next };
    });
  }

  function removeOption(index: number) {
    setForm((f) => ({
      ...f,
      options: f.options.filter((_, i) => i !== index),
    }));
  }

  function addOption() {
    setForm((f) => ({
      ...f,
      options: [...f.options, createEmptyOption()],
    }));
  }

  function moveOption(index: number, direction: "up" | "down") {
    setForm((f) => {
      const next = [...f.options];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, options: next };
    });
  }

  function updateReasonRule(
    index: number,
    updates: Partial<AdminQuestionReasonRule>,
  ) {
    setForm((f) => {
      const next = [...f.reasonRules];
      next[index] = { ...next[index], ...updates } as AdminQuestionReasonRule;
      return { ...f, reasonRules: next };
    });
  }

  function changeReasonRuleType(
    index: number,
    nextType: AdminQuestionReasonRule["type"],
  ) {
    setForm((f) => {
      const next = [...f.reasonRules];
      const current = next[index];
      if (nextType === "MULTI_OVERLAP") {
        next[index] = {
          type: nextType,
          template: current.template,
          priority: current.priority ?? 1,
          minOverlap: current.minOverlap ?? 1,
          maxLabels: current.maxLabels ?? 2,
        };
      } else {
        next[index] = {
          type: nextType,
          template: current.template,
          priority: current.priority ?? 1,
        };
      }
      return { ...f, reasonRules: next };
    });
  }

  function removeReasonRule(index: number) {
    setForm((f) => ({
      ...f,
      reasonRules: f.reasonRules.filter((_, i) => i !== index),
    }));
  }

  function addReasonRule() {
    setForm((f) => ({
      ...f,
      reasonRules: [...f.reasonRules, createEmptyReasonRule(f.type)],
    }));
  }

  /* ── Render: inline editor ─────────────────────────── */

  function renderEditor() {
    return (
      <form className="qb-card-body" onSubmit={saveQuestion}>
        <div className="qb-editor-grid">
          <label className="qb-field">
            <span>题目 Key</span>
            <input
              ref={editingId === "new" ? keyInputRef : undefined}
              required
              value={form.key}
              disabled={Boolean(form.questionId)}
              onChange={(e) =>
                setForm((f) => ({ ...f, key: e.target.value }))
              }
              placeholder="例如 relationship_style"
            />
          </label>
          <label className="qb-field">
            <span>题型</span>
            <select
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as AdminQuestion["type"],
                  selectionLimit:
                    e.target.value === "MULTI_SELECT" ? f.selectionLimit : "",
                }))
              }
            >
              <option value="SINGLE_SELECT">单选</option>
              <option value="MULTI_SELECT">多选</option>
              <option value="SCALE">量表</option>
            </select>
          </label>
        </div>

        <label className="qb-field qb-field-full">
          <span>题目内容</span>
          <textarea
            rows={2}
            required
            value={form.prompt}
            onChange={(e) =>
              setForm((f) => ({ ...f, prompt: e.target.value }))
            }
            placeholder="请输入题目描述…"
          />
        </label>

        {/* ── Options ─── */}
        <div className="qb-options-section">
          <span className="qb-section-label">选项</span>
          <div className="qb-options-list">
            {form.options.map((option, i) => (
              <div
                key={`opt-${form.questionId || "new"}-${i}`}
                className="qb-option-row"
              >
                <span className="qb-option-num">{i + 1}</span>
                <input
                  className="qb-option-label-input"
                  value={option.label}
                  onChange={(e) => updateOptionLabel(i, e.target.value)}
                  placeholder="选项文案"
                />
                <div className="qb-option-actions">
                  <button
                    type="button"
                    onClick={() => moveOption(i, "up")}
                    disabled={i === 0}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOption(i, "down")}
                    disabled={i === form.options.length - 1}
                    title="下移"
                  >
                    ↓
                  </button>
                  {form.options.length > 2 && (
                    <button
                      type="button"
                      className="qb-option-remove"
                      onClick={() => removeOption(i)}
                      title="移除选项"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="qb-add-option-btn"
            onClick={addOption}
          >
            + 添加选项
          </button>
        </div>

        {/* ── Advanced toggle ─── */}
        <button
          type="button"
          className="qb-advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? "▾" : "▸"} 高级设置
          <span className="qb-advanced-hint">
            权重{form.weight !== 1 ? ` (${form.weight})` : ""}、排序、理由规则
            {form.reasonRules.length > 0
              ? ` (${form.reasonRules.length})`
              : ""}
          </span>
        </button>

        {showAdvanced && (
          <div className="qb-advanced-section">
            <div className="qb-editor-grid">
              <label className="qb-field">
                <span>排序</span>
                <input
                  type="number"
                  min={1}
                  value={form.order}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      order: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="qb-field">
                <span>权重</span>
                <input
                  type="number"
                  min={1}
                  value={form.weight}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      weight: Number(e.target.value),
                    }))
                  }
                  />
              </label>
              {form.type === "MULTI_SELECT" ? (
                <label className="qb-field">
                  <span>最多可选</span>
                  <input
                    type="number"
                    min={1}
                    max={form.options.length}
                    value={form.selectionLimit}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        selectionLimit: e.target.value,
                      }))
                    }
                    placeholder="留空表示不限制"
                  />
                </label>
              ) : null}
            </div>

            <div className="qb-options-section">
              <div className="qb-section-header">
                <span className="qb-section-label">理由规则</span>
                <button
                  type="button"
                  className="qb-add-option-btn"
                  onClick={addReasonRule}
                >
                  + 添加规则
                </button>
              </div>

              {form.reasonRules.length === 0 && (
                <p className="qb-hint">
                  这道题目前只参与打分，不会生成匹配理由。
                </p>
              )}

              {form.reasonRules.map((rule, i) => (
                <div
                  key={`rule-${form.questionId || "new"}-${i}`}
                  className="qb-rule-card"
                >
                  <div className="qb-editor-grid">
                    <label className="qb-field">
                      <span>规则类型</span>
                      <select
                        value={rule.type}
                        onChange={(e) =>
                          changeReasonRuleType(
                            i,
                            e.target.value as AdminQuestionReasonRule["type"],
                          )
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
                    <label className="qb-field">
                      <span>优先级</span>
                      <input
                        type="number"
                        min={0}
                        value={rule.priority ?? 0}
                        onChange={(e) =>
                          updateReasonRule(i, {
                            priority: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="qb-field qb-field-full">
                    <span>模板</span>
                    <textarea
                      rows={2}
                      value={rule.template}
                      onChange={(e) =>
                        updateReasonRule(i, { template: e.target.value })
                      }
                      placeholder={
                        rule.type === "MULTI_OVERLAP"
                          ? "例如：你们都把 {{labels_2}} 放在重要位置。"
                          : "例如：你们对关系推进节奏的期待很接近。"
                      }
                    />
                  </label>
                  {rule.type === "MULTI_OVERLAP" && (
                    <div className="qb-editor-grid">
                      <label className="qb-field">
                        <span>最少命中数</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.minOverlap ?? 1}
                          onChange={(e) =>
                            updateReasonRule(i, {
                              minOverlap: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="qb-field">
                        <span>最多展示标签数</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.maxLabels ?? 2}
                          onChange={(e) =>
                            updateReasonRule(i, {
                              maxLabels: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    className="qb-rule-remove"
                    onClick={() => removeReasonRule(i)}
                  >
                    移除规则
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="qb-editor-actions">
          <button
            className="button-primary"
            type="submit"
            disabled={pending === "save"}
          >
            {pending === "save"
              ? "保存中…"
              : form.questionId
                ? "保存修改"
                : "创建题目"}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={cancelEditing}
          >
            取消
          </button>
        </div>
      </form>
    );
  }

  /* ── Render: page ──────────────────────────────────── */

  if (loading) {
    return <div className="admin-empty-state">正在加载问卷构建器...</div>;
  }

  return (
    <div className="qb-container">
      {/* Header */}
      <div className="qb-header">
        <div>
          <h1>问卷构建器</h1>
          <p className="qb-header-desc">
            点击题目卡片展开编辑，拖动左侧把手调整排序。
          </p>
        </div>
        <div className="auth-actions">
          <button
            className="button-secondary"
            onClick={() => void loadQuestionnaire()}
            type="button"
            style={{ minHeight: "2.4rem", padding: "0 1rem" }}
          >
            刷新
          </button>
          <button
            className="button-secondary"
            onClick={exportQuestions}
            type="button"
            style={{ minHeight: "2.4rem", padding: "0 1rem" }}
          >
            导出 JSON
          </button>
        </div>
      </div>

      {/* Stats / type filter */}
      <div className="qb-stats-row">
        {(["ALL", "SINGLE_SELECT", "MULTI_SELECT", "SCALE"] as const).map(
          (type) => (
            <button
              key={type}
              type="button"
              className={`qb-stat-pill${typeFilter === type ? " active" : ""}`}
              onClick={() => setTypeFilter(type)}
            >
              {type === "ALL" ? "全部" : TYPE_LABELS[type]}
              <span className="qb-stat-count">{typeCounts[type]}</span>
            </button>
          ),
        )}
      </div>

      {/* Search */}
      <div className="qb-search">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索题目 key、题干或题型…"
        />
        {search && (
          <button
            type="button"
            className="qb-search-clear"
            onClick={() => setSearch("")}
          >
            ×
          </button>
        )}
      </div>

      {error && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {/* Question list */}
      <div className="qb-list">
        {sortedQuestions.length === 0 && editingId !== "new" && (
          <div className="admin-empty-state">
            {isFiltered
              ? "没有匹配的题目。"
              : "问卷还没有题目，点击下方按钮添加第一道。"}
          </div>
        )}

        {sortedQuestions.map((question) => {
          const isEditing = editingId === question.id;
          const isDropTarget = dropTargetId === question.id;

          return (
            <div
              key={question.id}
              data-question-id={question.id}
              className={[
                "qb-card",
                isEditing && "qb-card-editing",
                isDraggingId === question.id && "qb-card-dragging",
                isDropTarget &&
                  dropPosition === "before" &&
                  "qb-drop-before",
                isDropTarget &&
                  dropPosition === "after" &&
                  "qb-drop-after",
              ]
                .filter(Boolean)
                .join(" ")}
              onDragOver={(e) => handleDragOver(e, question.id)}
              onDrop={handleDrop}
            >
              <div className="qb-card-header">
                {/* Drag handle — hidden when editing or filtering */}
                {!isEditing && !isFiltered ? (
                  <span
                    className="qb-drag-handle"
                    draggable
                    onDragStart={(e) => handleDragStart(e, question.id)}
                    onDragEnd={handleDragEnd}
                    title="拖动排序"
                  />
                ) : (
                  !isEditing && <span style={{ width: 10, flexShrink: 0 }} />
                )}

                <span className="qb-order-num">{question.order}</span>

                <div
                  className="qb-card-title"
                  onClick={() => !isEditing && startEditing(question)}
                >
                  <strong>{question.prompt || "(未命名题目)"}</strong>
                  <span className="qb-card-meta">
                    {question.key}
                    {question.weight !== 1 && ` · 权重 ${question.weight}`}
                    {question.type === "MULTI_SELECT" &&
                      question.selectionLimit != null &&
                      ` · 最多 ${question.selectionLimit} 项`}
                    {Array.isArray(question.options) &&
                      ` · ${question.options.length} 选项`}
                    {Array.isArray(question.reasonRules) &&
                      question.reasonRules.length > 0 &&
                      ` · ${question.reasonRules.length} 条理由`}
                  </span>
                </div>

                <span
                  className="qb-type-badge"
                  style={{
                    background: TYPE_COLORS[question.type].bg,
                    color: TYPE_COLORS[question.type].text,
                  }}
                >
                  {TYPE_LABELS[question.type]}
                </span>

                {!isEditing && (
                  <div className="qb-card-actions">
                    <button
                      type="button"
                      title="编辑"
                      onClick={() => startEditing(question)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="复制"
                      onClick={() => cloneQuestion(question)}
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      title="删除"
                      onClick={() => void deleteQuestion(question.id)}
                      disabled={pending === `delete-${question.id}`}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {isEditing && (
                  <button
                    type="button"
                    className="qb-collapse-btn"
                    onClick={cancelEditing}
                  >
                    收起
                  </button>
                )}
              </div>

              {isEditing && renderEditor()}
            </div>
          );
        })}

        {/* New question card */}
        {editingId === "new" && (
          <div className="qb-card qb-card-editing">
            <div className="qb-card-header">
              <span className="qb-order-num">+</span>
              <div className="qb-card-title">
                <strong>新增题目</strong>
              </div>
              <button
                type="button"
                className="qb-collapse-btn"
                onClick={cancelEditing}
              >
                取消
              </button>
            </div>
            {renderEditor()}
          </div>
        )}

        {/* Add button */}
        {editingId !== "new" && (
          <button type="button" className="qb-add-btn" onClick={startCreating}>
            <span>+</span>
            添加题目
          </button>
        )}
      </div>
    </div>
  );
}
