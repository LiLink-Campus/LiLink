"use client";

import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import type { AdminSchool } from "../types";

function emptySchoolForm() {
  return {
    name: "",
    slug: "",
    description: "",
    domains: "",
  };
}

export default function AdminSchoolsPage() {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createForm, setCreateForm] = useState(emptySchoolForm);
  const [editForm, setEditForm] = useState(emptySchoolForm);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const { data, loading, error, refresh } = useAdminCollection<AdminSchool>(
    "/admin/schools",
    {
      page,
      pageSize: 10,
      search: deferredSearch.trim(),
    },
  );
  const schools = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (!schools.length) {
      setSelectedSchoolId(null);
      return;
    }

    if (!selectedSchoolId || !schools.some((school) => school.id === selectedSchoolId)) {
      setSelectedSchoolId(schools[0].id);
    }
  }, [schools, selectedSchoolId]);

  const selectedSchool = schools.find((school) => school.id === selectedSchoolId) ?? null;

  useEffect(() => {
    if (!selectedSchool) {
      return;
    }

    setEditForm({
      name: selectedSchool.name,
      slug: selectedSchool.slug,
      description: selectedSchool.description ?? "",
      domains: selectedSchool.domains.map((domain) => domain.domain).join(", "),
    });
  }, [selectedSchool]);

  function normalizeDomains(value: string) {
    return value
      .split(",")
      .map((domain) => domain.trim())
      .filter(Boolean);
  }

  async function createSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("create");
    setActionError(null);

    try {
      const createdSchool = await fetchApi<AdminSchool>("/admin/schools", {
        method: "POST",
        body: JSON.stringify({
          ...createForm,
          domains: normalizeDomains(createForm.domains),
        }),
      });
      setCreateForm(emptySchoolForm());
      await refresh();
      setPage(1);
      setSelectedSchoolId(createdSchool.id);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "学校创建失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function updateSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool) {
      return;
    }

    setPending("update");
    setActionError(null);

    try {
      await fetchApi(`/admin/schools/${selectedSchool.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          domains: normalizeDomains(editForm.domains),
        }),
      });
      await refresh();
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "学校更新失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function deleteSchool() {
    if (!selectedSchool) {
      return;
    }

    const confirmed = window.confirm(`确定删除学校「${selectedSchool.name}」吗？`);
    if (!confirmed) {
      return;
    }

    setPending("delete");
    setActionError(null);

    try {
      await fetchApi(`/admin/schools/${selectedSchool.id}`, {
        method: "DELETE",
      });
      setSelectedSchoolId(null);
      await refresh();
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "学校删除失败。",
      );
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载学校中心...</div>;
  }

  return (
    <div className="admin-page admin-page-stack">
      <div className="admin-page-header">
        <div>
          <h1>学校中心</h1>
          <p>把学校档案与邮箱域名映射作为长期配置来维护，不和轮次搅在一起。</p>
        </div>
        <button className="button-secondary" onClick={() => void refresh()} type="button">
          刷新
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}

      <section className="admin-workspace-grid">
        <article className="content-panel admin-list-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">Schools</p>
              <h2>学校列表</h2>
            </div>
          </div>
          <div className="admin-search-bar">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索学校、slug 或域名"
            />
          </div>
          <div className="admin-record-list">
            {schools.map((school) => (
              <button
                key={school.id}
                type="button"
                className={
                  school.id === selectedSchoolId
                    ? "admin-record-item admin-record-item-active"
                    : "admin-record-item"
                }
                onClick={() => setSelectedSchoolId(school.id)}
              >
                <strong>{school.name}</strong>
                <p>{school.slug}</p>
                <div className="domain-chip-list">
                  {school.domains.slice(0, 3).map((domain) => (
                    <span key={domain.id} className="domain-chip">
                      @{domain.domain}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            {schools.length === 0 ? (
              <div className="admin-empty-state">没有找到匹配的学校。</div>
            ) : null}
          </div>
          {data ? (
            <div className="admin-pagination">
              <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">
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
          ) : null}
        </article>

        <article className="content-panel admin-detail-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">Selected School</p>
              <h2>{selectedSchool?.name ?? "选择一所学校"}</h2>
            </div>
            {selectedSchool ? (
              <button
                className="button-ghost"
                onClick={() => void deleteSchool()}
                type="button"
                disabled={pending === "delete"}
              >
                {pending === "delete" ? "删除中..." : "删除学校"}
              </button>
            ) : null}
          </div>

          {selectedSchool ? (
            <div className="admin-page-stack">
              <div className="admin-inline-metrics">
                <div>
                  <span>用户数</span>
                  <strong>{selectedSchool._count.users}</strong>
                </div>
                <div>
                  <span>域名数</span>
                  <strong>{selectedSchool.domains.length}</strong>
                </div>
              </div>

              <form className="auth-form" onSubmit={updateSchool}>
                <label>
                  <span>学校名称</span>
                  <input
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Slug</span>
                  <input value={editForm.slug} disabled />
                </label>
                <label>
                  <span>描述</span>
                  <textarea
                    rows={4}
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>邮箱域名</span>
                  <input
                    value={editForm.domains}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, domains: event.target.value }))
                    }
                    placeholder="school.edu, students.school.edu"
                  />
                </label>
                <button className="button-primary" type="submit" disabled={pending === "update"}>
                  {pending === "update" ? "保存中..." : "保存学校"}
                </button>
              </form>
            </div>
          ) : (
            <div className="admin-empty-state">左侧选择学校后可查看和编辑详情。</div>
          )}
        </article>
      </section>

      <section className="content-panel">
        <div className="admin-section-header">
          <div>
            <p className="eyebrow">Create</p>
            <h2>新增学校</h2>
          </div>
        </div>
        <form className="auth-form" onSubmit={createSchool}>
          <div className="form-grid">
            <label>
              <span>学校名称</span>
              <input
                required
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                required
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </label>
          </div>
          <label>
            <span>描述</span>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label>
            <span>邮箱域名</span>
            <input
              required
              value={createForm.domains}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, domains: event.target.value }))
              }
              placeholder="school.edu, students.school.edu"
            />
          </label>
          <button className="button-primary" type="submit" disabled={pending === "create"}>
            {pending === "create" ? "创建中..." : "创建学校"}
          </button>
        </form>
      </section>
    </div>
  );
}
