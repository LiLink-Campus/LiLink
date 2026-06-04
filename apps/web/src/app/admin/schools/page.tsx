"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import cardStyles from "../admin-card.module.css";
import schoolStyles from "./admin-schools.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminSchool } from "../types";

const adminStyles = [commonStyles, cardStyles, schoolStyles];

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
      <form className={cx(adminStyles, "qb-card-body")} onSubmit={saveSchool}>
        <div className={cx(adminStyles, "qb-editor-grid")}>
          <label className={cx(adminStyles, "qb-field")}>
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
          <label className={cx(adminStyles, "qb-field")}>
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

        <label className={cx(adminStyles, "qb-field qb-field-full")}>
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

        <label className={cx(adminStyles, "qb-field qb-field-full")}>
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

        <div className={cx(adminStyles, "qb-editor-actions")}>
          <button
            className="ui-button ui-button--primary"
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
            className="ui-button ui-button--secondary"
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
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载学校中心...</div>;
  }

  return (
    <div className={cx(adminStyles, "qb-container")}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>学校中心</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>
            点击学校卡片展开编辑，管理学校档案与邮箱域名映射。
          </p>
        </div>
        <div className="auth-actions">
          <button
            className={cx(adminStyles, "ui-button ui-button--secondary admin-refresh-control")}
            onClick={() => void refresh()}
            type="button"
          >
            刷新
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={cx(adminStyles, "qb-stats-row")}>
        <span className={cx(adminStyles, "qb-stat-pill active")}>
          学校总数
          <span className={cx(adminStyles, "qb-stat-count")}>{data?.total ?? 0}</span>
        </span>
      </div>

      {/* Search */}
      <form className={cx(adminStyles, "ic-search-bar sch-search-bar")} onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="搜索学校名称、slug 或邮箱域名…"
          aria-label="搜索学校"
        />
        {draftSearch && (
          <button
            type="button"
            className={cx(adminStyles, "ic-search-clear")}
            aria-label="清除搜索"
            onClick={() => {
              clearSearch();
              setPage(1);
            }}
          >
            ×
          </button>
        )}
        <button className={cx(adminStyles, "ui-button ui-button--primary ic-search-submit")} type="submit">
          搜索
        </button>
      </form>

      {mergeSource && (
        <div className={cx(adminStyles, "admin-merge-banner ui-form-message ui-form-message--success")}>
          <span>
            已选择「{mergeSource.name}」为合并来源，点击目标学校卡片上的「合并到此」完成合并。
          </span>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => setMergeSource(null)}
          >
            取消合并
          </button>
        </div>
      )}

      {loadError && (
        <p className={cx(adminStyles, "ui-form-message ui-form-message--error admin-message-bottom")}>
          {loadError}
        </p>
      )}
      {error && (
        <p className={cx(adminStyles, "ui-form-message ui-form-message--error admin-message-bottom")}>
          {error}
        </p>
      )}

      {/* School list */}
      <div className={cx(adminStyles, "qb-list")}>
        {schools.length === 0 && editingId !== "new" && (
          <div className={cx(adminStyles, "admin-empty-state")}>
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
              className={cx(
                adminStyles,
                "qb-card sch-school-card",
                isEditing && "qb-card-editing",
              )}
            >
              <div className={cx(adminStyles, "qb-card-header sch-card-header")}>
                <div className={cx(adminStyles, "sch-card-main")}>
                  <span className={cx(adminStyles, "qb-order-num sch-card-count")}>
                    {school._count.users}
                  </span>

                  <div
                    className={cx(adminStyles, "qb-card-title sch-card-title")}
                    onClick={() => !isEditing && startEditing(school)}
                  >
                    <strong>{school.name}</strong>
                    <span className={cx(adminStyles, "qb-card-meta")}>
                      {school.slug} · {school._count.users} 用户
                    </span>
                    {!isEditing && school.domains.length > 0 && (
                      <div className={cx(adminStyles, "sch-card-domains")}>
                        {school.domains.map((d) => (
                          <span key={d.id} className={cx(adminStyles, "ui-badge ui-badge--neutral sch-domain-chip")}>
                            @{d.domain}
                          </span>
                        ))}
                      </div>
                    )}
                    {!isEditing && school.domains.length === 0 && (
                      <p className={cx(adminStyles, "sch-card-empty-domains")}>未配置邮箱域名</p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className={cx(adminStyles, "qb-card-actions sch-card-actions")}>
                      {mergeSource && mergeSource.id !== school.id ? (
                        <button
                          type="button"
                          className={cx(adminStyles, "ui-button ui-button--secondary sch-card-action-btn")}
                          title={`合并「${mergeSource.name}」到此学校`}
                          disabled={pending === "merge"}
                          onClick={() => void mergeInto(school)}
                        >
                          {pending === "merge" ? "合并中…" : "合并到此"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={cx(adminStyles, "sch-card-action-btn")}
                          title="选为合并来源"
                          aria-pressed={mergeSource?.id === school.id}
                          onClick={() =>
                            setMergeSource(
                              mergeSource?.id === school.id ? null : school,
                            )
                          }
                        >
                          ⇄
                        </button>
                      )}
                      <button
                        type="button"
                        className={cx(adminStyles, "sch-card-action-btn")}
                        title="编辑"
                        onClick={() => startEditing(school)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={cx(adminStyles, "sch-card-action-btn")}
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
                      className={cx(adminStyles, "qb-collapse-btn sch-card-collapse")}
                      onClick={cancelEditing}
                    >
                      收起
                    </button>
                  )}
                </div>
              </div>

              {isEditing && renderEditor()}
            </div>
          );
        })}

        {/* New school card */}
        {editingId === "new" && (
          <div className={cx(adminStyles, "qb-card qb-card-editing")}>
            <div className={cx(adminStyles, "qb-card-header")}>
              <span className={cx(adminStyles, "qb-order-num")}>+</span>
              <div className={cx(adminStyles, "qb-card-title")}>
                <strong>新增学校</strong>
              </div>
              <button
                type="button"
                className={cx(adminStyles, "qb-collapse-btn")}
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
            className={cx(adminStyles, "qb-add-btn")}
            onClick={startCreating}
          >
            <span>+</span>
            添加学校
          </button>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <AdminPagination
          className={cx(adminStyles, "admin-pagination")}
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          unit="所学校"
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
