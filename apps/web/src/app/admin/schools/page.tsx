"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminSchool } from "../types";

function emptySchoolForm() {
  return { name: "", slug: "", description: "", domains: "" };
}

function normalizeDomains(value: string) {
  return value
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export default function AdminSchoolsPage() {
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySchoolForm);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<AdminSchool | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const {
    draftSearch,
    submittedSearch,
    setDraftSearch,
    submitSearch,
    clearSearch,
  } = useAdminSearch();
  const {
    data,
    loading,
    error: loadError,
    refresh,
  } = useAdminCollection<AdminSchool>("/admin/schools", {
    page,
    pageSize: 20,
    search: submittedSearch.trim(),
  });

  const schools = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (editingId === "new") {
      nameInputRef.current?.focus();
    }
  }, [editingId]);

  function startEditing(school: AdminSchool) {
    setEditingId(school.id);
    setForm({
      name: school.name,
      slug: school.slug,
      description: school.description ?? "",
      domains: school.domains.map((d) => d.domain).join(", "),
    });
    setError(null);
  }

  function startCreating() {
    setEditingId("new");
    setForm(emptySchoolForm());
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setError(null);
  }

  async function saveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setError(null);

    try {
      if (editingId === "new") {
        await fetchApi("/admin/schools", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            domains: normalizeDomains(form.domains),
          }),
        });
      } else {
        await fetchApi(`/admin/schools/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            domains: normalizeDomains(form.domains),
          }),
        });
      }
      setEditingId(null);
      await refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "保存失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function mergeInto(target: AdminSchool) {
    if (!mergeSource || mergeSource.id === target.id) return;
    if (
      !confirm(
        `确定将「${mergeSource.name}」的所有用户和域名合并到「${target.name}」？\n合并后「${mergeSource.name}」将被删除，此操作不可撤回。`,
      )
    )
      return;

    setPending("merge");
    setError(null);
    try {
      await fetchApi(
        `/admin/schools/${mergeSource.id}/merge-into/${target.id}`,
        { method: "POST" },
      );
      setMergeSource(null);
      await refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "合并失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function deleteSchool(school: AdminSchool) {
    if (!confirm(`确定删除学校「${school.name}」吗？此操作不可撤回。`)) return;
    setPending(`delete-${school.id}`);
    setError(null);

    try {
      await fetchApi(`/admin/schools/${school.id}`, { method: "DELETE" });
      if (editingId === school.id) setEditingId(null);
      await refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "删除失败。",
      );
    } finally {
      setPending(null);
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  function renderEditor() {
    return (
      <form className="qb-card-body" onSubmit={saveSchool}>
        <div className="qb-editor-grid">
          <label className="qb-field">
            <span>学校名称</span>
            <input
              ref={editingId === "new" ? nameInputRef : undefined}
              required
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="例如 上海交通大学"
            />
          </label>
          <label className="qb-field">
            <span>标识 (Slug)</span>
            <input
              required={editingId === "new"}
              value={form.slug}
              disabled={editingId !== "new"}
              onChange={(e) =>
                setForm((f) => ({ ...f, slug: e.target.value }))
              }
              placeholder="例如 sjtu"
            />
          </label>
        </div>

        <label className="qb-field qb-field-full">
          <span>描述</span>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="可选的学校简介"
          />
        </label>

        <label className="qb-field qb-field-full">
          <span>邮箱域名（逗号分隔）</span>
          <input
            required={editingId === "new"}
            value={form.domains}
            onChange={(e) =>
              setForm((f) => ({ ...f, domains: e.target.value }))
            }
            placeholder="school.edu, students.school.edu"
          />
        </label>

        <div className="qb-editor-actions">
          <button
            className="button-primary"
            type="submit"
            disabled={pending === "save"}
          >
            {pending === "save"
              ? "保存中…"
              : editingId === "new"
                ? "创建学校"
                : "保存修改"}
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

  if (loading) {
    return <div className="admin-empty-state">正在加载学校中心...</div>;
  }

  return (
    <div className="qb-container">
      <div className="qb-header">
        <div>
          <h1>学校中心</h1>
          <p className="qb-header-desc">
            点击学校卡片展开编辑，管理学校档案与邮箱域名映射。
          </p>
        </div>
        <div className="auth-actions">
          <button
            className="button-secondary"
            onClick={() => void refresh()}
            type="button"
            style={{ minHeight: "2.4rem", padding: "0 1rem" }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="qb-stats-row">
        <span className="qb-stat-pill active">
          学校总数
          <span className="qb-stat-count">{data?.total ?? 0}</span>
        </span>
      </div>

      {/* Search */}
      <form className="qb-search" onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="搜索学校名称、slug 或邮箱域名…"
        />
        {draftSearch && (
          <button
            type="button"
            className="qb-search-clear"
            onClick={() => {
              clearSearch();
              setPage(1);
            }}
          >
            ×
          </button>
        )}
      </form>

      {mergeSource && (
        <div className="form-success" style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>已选择「{mergeSource.name}」为合并来源，点击目标学校卡片上的「合并到此」完成合并。</span>
          <button type="button" className="button-secondary" onClick={() => setMergeSource(null)} style={{ minHeight: "1.8rem", padding: "0 0.75rem", fontSize: "0.82rem" }}>取消合并</button>
        </div>
      )}

      {loadError && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {loadError}
        </p>
      )}
      {error && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {/* School list */}
      <div className="qb-list">
        {schools.length === 0 && editingId !== "new" && (
          <div className="admin-empty-state">
            {submittedSearch.trim()
              ? "没有找到匹配的学校。"
              : "还没有学校，点击下方按钮添加第一所。"}
          </div>
        )}

        {schools.map((school) => {
          const isEditing = editingId === school.id;

          return (
            <div
              key={school.id}
              className={`qb-card${isEditing ? " qb-card-editing" : ""}`}
            >
              <div className="qb-card-header">
                <span className="qb-order-num" style={{ fontSize: "0.7rem" }}>
                  {school._count.users}
                </span>

                <div
                  className="qb-card-title"
                  onClick={() => !isEditing && startEditing(school)}
                >
                  <strong>{school.name}</strong>
                  <span className="qb-card-meta">
                    {school.slug}
                    {" · "}
                    {school.domains.length > 0
                      ? school.domains.map((d) => `@${d.domain}`).join(", ")
                      : "未配置域名"}
                    {" · "}
                    {school._count.users} 用户
                  </span>
                </div>

                <div className="domain-chip-list" style={{ flexShrink: 0 }}>
                  {school.domains.slice(0, 2).map((d) => (
                    <span key={d.id} className="domain-chip">
                      @{d.domain}
                    </span>
                  ))}
                  {school.domains.length > 2 && (
                    <span className="domain-chip">
                      +{school.domains.length - 2}
                    </span>
                  )}
                </div>

                {!isEditing && (
                  <div className="qb-card-actions">
                    {mergeSource && mergeSource.id !== school.id ? (
                      <button
                        type="button"
                        title={`合并「${mergeSource.name}」到此学校`}
                        disabled={pending === "merge"}
                        onClick={() => void mergeInto(school)}
                        style={{ fontSize: "0.82rem", padding: "0.15rem 0.5rem" }}
                      >
                        {pending === "merge" ? "合并中…" : "合并到此"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="选为合并来源"
                        onClick={() => setMergeSource(mergeSource?.id === school.id ? null : school)}
                        style={mergeSource?.id === school.id ? { color: "var(--accent)" } : undefined}
                      >
                        ⇄
                      </button>
                    )}
                    <button
                      type="button"
                      title="编辑"
                      onClick={() => startEditing(school)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      title="删除"
                      onClick={() => void deleteSchool(school)}
                      disabled={pending === `delete-${school.id}`}
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

        {/* New school card */}
        {editingId === "new" && (
          <div className="qb-card qb-card-editing">
            <div className="qb-card-header">
              <span className="qb-order-num">+</span>
              <div className="qb-card-title">
                <strong>新增学校</strong>
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
          <button
            type="button"
            className="qb-add-btn"
            onClick={startCreating}
          >
            <span>+</span>
            添加学校
          </button>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="admin-pagination">
          <button
            disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}
            type="button"
          >
            上一页
          </button>
          <span>
            {data.page} / {data.totalPages} · 共 {data.total} 所学校
          </span>
          <button
            disabled={data.page >= data.totalPages}
            onClick={() => setPage(data.page + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
