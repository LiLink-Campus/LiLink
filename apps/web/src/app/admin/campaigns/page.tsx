"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import type {
  AdminCampaign,
  AdminCouponTemplate,
  AdminMerchant,
  PaginatedResult,
} from "../types";

const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "ENDED"] as const;
const BENEFIT_OPTIONS = [
  { value: "FULL_REDUCTION", label: "满减" },
  { value: "DISCOUNT", label: "折扣" },
  { value: "GIFT", label: "赠品" },
  { value: "CUSTOM", label: "自定义" },
];

export default function AdminCampaignsPage() {
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, error: loadError, refresh } =
    useAdminCollection<AdminCampaign>("/admin/campaigns", { page, pageSize: 20 });

  const campaigns = useMemo(() => data?.items ?? [], [data]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setPending("create");
    setError(null);
    try {
      await fetchApi("/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
        }),
      });
      setName("");
      setSlug("");
      setDescription("");
      setPage(1);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败。");
    } finally {
      setPending(null);
    }
  }

  async function applyStatus(
    campaign: AdminCampaign,
    status: string,
    isDefault: boolean,
  ) {
    setPending(`status-${campaign.id}`);
    setError(null);
    try {
      await fetchApi(`/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, isDefault }),
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载活动…</div>;
  }

  return (
    <div className="qb-container">
      <div className="qb-header">
        <div>
          <h1>活动与券包</h1>
          <p className="qb-header-desc">
            标准顺序：建活动 + 券包 → 置 ACTIVE 且设为默认 → 再推广拉新。归属在注册时冻结，活动须在拉新前上线。
          </p>
        </div>
        <button
          className="button-secondary"
          onClick={() => void refresh()}
          type="button"
          style={{ minHeight: "2.4rem", padding: "0 1rem" }}
        >
          刷新
        </button>
      </div>

      <form className="qb-search" onSubmit={createCampaign}>
        <input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="活动名称…"
        />
        <input
          value={slug}
          maxLength={64}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="slug（?c= 用，小写字母数字-）"
        />
        <input
          value={description}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="说明（可选）"
        />
        <button
          className="button-primary"
          type="submit"
          disabled={pending === "create" || !name.trim() || !slug.trim()}
          style={{ minHeight: "2.4rem", padding: "0 1rem", flexShrink: 0 }}
        >
          {pending === "create" ? "创建中…" : "新建活动"}
        </button>
      </form>

      {(loadError || error) && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {loadError ?? error}
        </p>
      )}

      <div className="qb-list">
        {campaigns.length === 0 && (
          <div className="admin-empty-state">还没有活动，在上方新建第一个。</div>
        )}
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="qb-card">
            <div className="qb-card-header">
              <div className="qb-card-title">
                <strong>{campaign.name}</strong>
                <span className="qb-card-meta">
                  {campaign.slug} · {campaign.status}
                  {campaign.isDefault ? " · 默认" : ""}
                  {` · 券包 ${campaign.templateCount} · 激活 ${campaign.activationCount}`}
                </span>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() =>
                  setSelectedId((current) =>
                    current === campaign.id ? null : campaign.id,
                  )
                }
                style={{ minHeight: "1.9rem", padding: "0 0.75rem", fontSize: "0.82rem" }}
              >
                {selectedId === campaign.id ? "收起" : "券包"}
              </button>
            </div>

            <CampaignStatusControls
              campaign={campaign}
              pending={pending === `status-${campaign.id}`}
              onApply={(status, isDefault) =>
                void applyStatus(campaign, status, isDefault)
              }
            />

            {selectedId === campaign.id && (
              <CampaignTemplatesPanel campaignId={campaign.id} />
            )}
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">
            上一页
          </button>
          <span>
            {data.page} / {data.totalPages} · 共 {data.total} 个活动
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

function CampaignStatusControls({
  campaign,
  pending,
  onApply,
}: {
  campaign: AdminCampaign;
  pending: boolean;
  onApply: (status: string, isDefault: boolean) => void;
}) {
  const [status, setStatus] = useState(campaign.status);
  const [isDefault, setIsDefault] = useState(campaign.isDefault);

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: "0.5rem",
      }}
    >
      <select value={status} onChange={(event) => setStatus(event.target.value as AdminCampaign["status"])}>
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
        设为默认
      </label>
      <button
        type="button"
        className="button-secondary"
        disabled={pending}
        onClick={() => onApply(status, isDefault)}
      >
        {pending ? "应用中…" : "应用状态"}
      </button>
    </div>
  );
}

function CampaignTemplatesPanel({ campaignId }: { campaignId: string }) {
  const [templates, setTemplates] = useState<AdminCouponTemplate[] | null>(null);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [title, setTitle] = useState("");
  const [benefitType, setBenefitType] = useState("FULL_REDUCTION");
  const [faceValue, setFaceValue] = useState("");
  const [validDays, setValidDays] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await fetchApi<{ items: AdminCouponTemplate[] }>(
        `/admin/campaigns/${campaignId}/templates`,
      );
      setTemplates(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载券包失败。");
    }
  }, [campaignId]);

  useEffect(() => {
    void loadTemplates();
    void fetchApi<PaginatedResult<AdminMerchant>>(
      "/admin/merchants?pageSize=50&status=active",
    )
      .then((result) => setMerchants(result.items))
      .catch(() => undefined);
  }, [loadTemplates]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!merchantId || !title.trim() || !faceValue) return;
    setPending("create");
    setError(null);
    try {
      await fetchApi(`/admin/campaigns/${campaignId}/templates`, {
        method: "POST",
        body: JSON.stringify({
          merchantId,
          title: title.trim(),
          benefitType,
          faceValue: Number(faceValue),
          validDays: validDays ? Number(validDays) : undefined,
        }),
      });
      setTitle("");
      setFaceValue("");
      setValidDays("");
      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建券模板失败。");
    } finally {
      setPending(null);
    }
  }

  async function toggleTemplate(template: AdminCouponTemplate) {
    setPending(`tpl-${template.id}`);
    setError(null);
    try {
      await fetchApi(`/admin/coupon-templates/${template.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      await loadTemplates();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ padding: "0.75rem 0", borderTop: "1px solid var(--border, #eee)" }}>
      {error && <p className="form-error">{error}</p>}

      <h4>券包（券模板）</h4>
      {templates === null ? (
        <p>加载中…</p>
      ) : templates.length === 0 ? (
        <p>暂无券模板。</p>
      ) : (
        templates.map((template) => (
          <div key={template.id} className="me-card-field">
            <span className="me-card-label">
              {template.title} · {template.merchant?.name ?? template.merchantId} · 面值{" "}
              {(template.faceValue / 100).toFixed(2)} 元 ·{" "}
              {template.isActive ? "启用" : "停用"}
            </span>
            <button
              type="button"
              disabled={pending === `tpl-${template.id}`}
              onClick={() => void toggleTemplate(template)}
            >
              {template.isActive ? "停用" : "启用"}
            </button>
          </div>
        ))
      )}

      <form className="qb-search" onSubmit={createTemplate} style={{ marginTop: "0.5rem" }}>
        <select value={merchantId} onChange={(event) => setMerchantId(event.target.value)}>
          <option value="">选择商家…</option>
          {merchants.map((merchant) => (
            <option key={merchant.id} value={merchant.id}>
              {merchant.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="券标题，如 满50减10"
        />
        <select value={benefitType} onChange={(event) => setBenefitType(event.target.value)}>
          {BENEFIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={faceValue}
          onChange={(event) => setFaceValue(event.target.value)}
          placeholder="名义面值（分）"
        />
        <input
          type="number"
          min={1}
          value={validDays}
          onChange={(event) => setValidDays(event.target.value)}
          placeholder="有效天数（可选）"
        />
        <button
          className="button-primary"
          type="submit"
          disabled={pending === "create" || !merchantId || !title.trim() || !faceValue}
        >
          新增券模板
        </button>
      </form>
    </div>
  );
}
