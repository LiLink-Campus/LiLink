"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  renderBenefitText,
  type CouponBenefitType,
  type CouponRule,
} from "@lilink/shared";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import cardStyles from "../admin-card.module.css";
import {
  AdminRefreshButton,
  BENEFIT_TYPE_LABELS,
  buildCouponRule,
  CAMPAIGN_STATUS_BADGE,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_OPTIONS,
  CopyTextButton,
  CouponTierEditor,
  emptyTierDraft,
  type CouponTierDraft,
} from "../merchant-admin-ui";
import { useAdminCollection } from "../use-admin-collection";
import type {
  AdminCampaign,
  AdminCouponTemplate,
  AdminMerchant,
  PaginatedResult,
} from "../types";
import merchantStyles from "../merchant-admin.module.css";

const adminStyles = [commonStyles, cardStyles, merchantStyles];

type StatusFilter = "" | "DRAFT" | "ACTIVE" | "ENDED";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "全部" },
  { value: "DRAFT", label: "草稿" },
  { value: "ACTIVE", label: "进行中" },
  { value: "ENDED", label: "已结束" },
];

const BENEFIT_OPTIONS = [
  { value: "FULL_REDUCTION", label: "满减" },
  { value: "DISCOUNT", label: "折扣" },
  { value: "GIFT", label: "赠品" },
  { value: "CUSTOM", label: "自定义" },
];

export default function AdminCampaignsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, error: loadError, refresh } =
    useAdminCollection<AdminCampaign>("/admin/campaigns", {
      page,
      pageSize: 20,
      status: statusFilter || undefined,
    });

  const campaigns = useMemo(() => data?.items ?? [], [data]);

  const pageTotals = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => {
        acc.templates += campaign.templateCount;
        acc.activations += campaign.activationCount;
        if (campaign.status === "ACTIVE") acc.active += 1;
        if (campaign.isDefault) acc.defaultCount += 1;
        return acc;
      },
      { templates: 0, activations: 0, active: 0, defaultCount: 0 },
    );
  }, [campaigns]);

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
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载活动…</div>;
  }

  return (
    <div className={cx(adminStyles, "qb-container")}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>活动与券包</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>
            标准顺序：建活动 + 券包 → 置 ACTIVE 且设为默认 → 再推广拉新。归属在注册时冻结，活动须在拉新前上线。
          </p>
        </div>
        <AdminRefreshButton onClick={() => void refresh()} />
      </div>

      <div className={cx(adminStyles, "qb-metrics")}>
        <div className={cx(adminStyles, "qb-metric")}>
          <div className={cx(adminStyles, "qb-metric-value")}>{data?.total ?? 0}</div>
          <div className={cx(adminStyles, "qb-metric-label")}>活动总数</div>
        </div>
        <div className={cx(adminStyles, "qb-metric")}>
          <div className={cx(adminStyles, "qb-metric-value")}>{pageTotals.active}</div>
          <div className={cx(adminStyles, "qb-metric-label")}>本页进行中</div>
        </div>
        <div className={cx(adminStyles, "qb-metric")}>
          <div className={cx(adminStyles, "qb-metric-value")}>{pageTotals.templates}</div>
          <div className={cx(adminStyles, "qb-metric-label")}>本页券模板</div>
        </div>
        <div className={cx(adminStyles, "qb-metric")}>
          <div className={cx(adminStyles, "qb-metric-value")}>{pageTotals.activations}</div>
          <div className={cx(adminStyles, "qb-metric-label")}>本页激活数</div>
        </div>
      </div>

      <section className={cx(adminStyles, "ic-create-panel admin-highlight-card")}>
        <div>
          <h2>新建活动</h2>
          <p className={cx(adminStyles, "qb-header-desc admin-header-desc-spaced")}>
            slug 用于注册链接 <code className={cx(adminStyles, "mp-slug")}>?c=</code>{" "}
            参数，仅小写字母、数字与连字符。
          </p>
        </div>
        <form className={cx(adminStyles, "mp-create-form")} onSubmit={createCampaign}>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="活动名称"
            aria-label="活动名称"
          />
          <input
            value={slug}
            maxLength={64}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="slug，如 spring-2026"
            aria-label="活动 slug"
          />
          <input
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="说明（可选）"
            aria-label="活动说明"
          />
          <button
            className="ui-button ui-button--primary"
            type="submit"
            disabled={pending === "create" || !name.trim() || !slug.trim()}
          >
            {pending === "create" ? "创建中…" : "新建活动"}
          </button>
        </form>
      </section>

      {(loadError || error) && (
        <p className={cx(adminStyles, "ui-form-message ui-form-message--error admin-message-block")}>
          {loadError ?? error}
        </p>
      )}

      <section className={cx(adminStyles, "ic-list-panel mp-list-panel")}>
        <div className={cx(adminStyles, "mp-list-toolbar")}>
          <div className={cx(adminStyles, "ic-status-tabs")} role="tablist" aria-label="活动状态筛选">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.value}
                className={cx(
                  adminStyles,
                  "ic-status-tab",
                  statusFilter === tab.value && "is-active",
                )}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={cx(adminStyles, "ic-list-meta")}>
          <p className={cx(adminStyles, "qb-header-desc admin-text-reset")}>
            共 {data?.total ?? 0} 个活动
            {pageTotals.defaultCount > 0
              ? ` · 本页默认活动 ${pageTotals.defaultCount} 个`
              : ""}
          </p>
        </div>

        <div className={cx(adminStyles, "qb-list admin-list-top")}>
          {campaigns.length === 0 && (
            <div className={cx(adminStyles, "admin-empty-state ic-list-empty")}>
              {statusFilter
                ? "当前筛选下没有活动，试试切换状态或新建一个。"
                : "还没有活动，在上方新建第一个。"}
            </div>
          )}
          {campaigns.map((campaign) => {
            const expanded = selectedId === campaign.id;
            return (
              <div
                key={campaign.id}
                className={cx(
                  adminStyles,
                  "qb-card",
                  expanded && "mp-card-expanded",
                )}
              >
                <div className={cx(adminStyles, "qb-card-header")}>
                  <div className={cx(adminStyles, "qb-card-title")}>
                    <strong>{campaign.name}</strong>
                    <div className={cx(adminStyles, "mp-slug-row")}>
                      <code className={cx(adminStyles, "mp-slug")}>{campaign.slug}</code>
                      <CopyTextButton
                        text={campaign.slug}
                        label="复制 slug"
                        copiedLabel="已复制"
                      />
                      {campaign.isDefault && (
                        <span className={cx(adminStyles, "qb-badge is-active")}>默认</span>
                      )}
                    </div>
                    <div className={cx(adminStyles, "mp-inline-stats")}>
                      <span className={cx(adminStyles, "mp-inline-stat")}>
                        券包 <strong>{campaign.templateCount}</strong>
                      </span>
                      <span className={cx(adminStyles, "mp-inline-stat")}>
                        激活 <strong>{campaign.activationCount}</strong>
                      </span>
                    </div>
                  </div>
                  <span
                    className={cx(
                      adminStyles,
                      "qb-badge",
                      CAMPAIGN_STATUS_BADGE[campaign.status] ?? "",
                    )}
                  >
                    {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                  </span>
                  <div className={cx(adminStyles, "mp-card-actions")}>
                    <button
                      type="button"
                      className="ui-button ui-button--secondary"
                      onClick={() =>
                        setSelectedId((current) =>
                          current === campaign.id ? null : campaign.id,
                        )
                      }
                    >
                      {expanded ? "收起券包" : "管理券包"}
                    </button>
                  </div>
                </div>

                <CampaignStatusControls
                  campaign={campaign}
                  pending={pending === `status-${campaign.id}`}
                  onApply={(status, isDefault) =>
                    void applyStatus(campaign, status, isDefault)
                  }
                />

                {expanded && <CampaignTemplatesPanel campaignId={campaign.id} />}
              </div>
            );
          })}
        </div>

        {data && data.totalPages > 1 && (
          <AdminPagination
            className={cx(adminStyles, "admin-pagination ic-list-pagination")}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="个活动"
            onPageChange={setPage}
          />
        )}
      </section>
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

  useEffect(() => {
    setStatus(campaign.status);
    setIsDefault(campaign.isDefault);
  }, [campaign.status, campaign.isDefault]);

  const dirty =
    status !== campaign.status || isDefault !== campaign.isDefault;

  return (
    <div className={cx(adminStyles, "mp-status-row")}>
      <select
        value={status}
        aria-label="活动状态"
        onChange={(event) =>
          setStatus(event.target.value as AdminCampaign["status"])
        }
      >
        {CAMPAIGN_STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {CAMPAIGN_STATUS_LABELS[option] ?? option}
          </option>
        ))}
      </select>
      <label>
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
        设为默认活动
      </label>
      <button
        type="button"
        className="ui-button ui-button--secondary"
        disabled={pending || !dirty}
        onClick={() => onApply(status, isDefault)}
      >
        {pending ? "保存中…" : "保存状态"}
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
  const [tiers, setTiers] = useState<CouponTierDraft[]>([emptyTierDraft()]);
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

    let rule: Record<string, unknown> | null;
    try {
      rule = buildCouponRule(benefitType, tiers);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "优惠规则无效。");
      return;
    }

    setPending("create");
    setError(null);
    try {
      await fetchApi(`/admin/campaigns/${campaignId}/templates`, {
        method: "POST",
        body: JSON.stringify({
          merchantId,
          title: title.trim(),
          benefitType,
          faceValue: Math.round(Number(faceValue) * 100),
          validDays: validDays ? Number(validDays) : undefined,
          ...(rule ? { rule } : {}),
        }),
      });
      setTitle("");
      setFaceValue("");
      setValidDays("");
      setTiers([emptyTierDraft()]);
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
    <div className={cx(adminStyles, "qb-subpanel")}>
      {error && <p className="ui-form-message ui-form-message--error">{error}</p>}

      <h4>券包（券模板）</h4>
      {templates === null ? (
        <p className={cx(adminStyles, "qb-header-desc")}>加载中…</p>
      ) : templates.length === 0 ? (
        <p className={cx(adminStyles, "qb-header-desc")}>暂无券模板，在下方为合作商家添加第一张券。</p>
      ) : (
        <div className={cx(adminStyles, "mp-subpanel-list")}>
          {templates.map((template) => (
            <div key={template.id} className={cx(adminStyles, "mp-subpanel-row")}>
              <div className={cx(adminStyles, "mp-subpanel-row-main")}>
                <span className={cx(adminStyles, "mp-subpanel-row-title")}>{template.title}</span>
                <span className={cx(adminStyles, "mp-subpanel-row-meta")}>
                  {template.merchant?.name ?? template.merchantId} ·{" "}
                  {BENEFIT_TYPE_LABELS[template.benefitType] ?? template.benefitType} ·
                  面值 {(template.faceValue / 100).toFixed(2)} 元
                  {template.validDays ? ` · ${template.validDays} 天有效` : ""}
                </span>
                {template.benefitType !== "CUSTOM" && (
                  <span className={cx(adminStyles, "mp-subpanel-row-rule")}>
                    {renderBenefitText({
                      benefitType: template.benefitType as CouponBenefitType,
                      title: template.title,
                      faceValue: template.faceValue,
                      rule: template.rule as CouponRule | null,
                    })}
                  </span>
                )}
              </div>
              <div className={cx(adminStyles, "mp-card-actions")}>
                <span
                  className={cx(
                    adminStyles,
                    "qb-badge",
                    template.isActive ? "is-active" : "is-off",
                  )}
                >
                  {template.isActive ? "启用" : "停用"}
                </span>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  disabled={pending === `tpl-${template.id}`}
                  onClick={() => void toggleTemplate(template)}
                >
                  {template.isActive ? "停用" : "启用"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 className={cx(adminStyles, "campaign-subheading")}>新增券模板</h4>
      <form className={cx(adminStyles, "mp-form-grid")} onSubmit={createTemplate}>
        <select
          value={merchantId}
          aria-label="合作商家"
          onChange={(event) => setMerchantId(event.target.value)}
        >
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
          aria-label="券标题"
        />
        <select
          value={benefitType}
          aria-label="优惠类型"
          onChange={(event) => setBenefitType(event.target.value)}
        >
          {BENEFIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          value={faceValue}
          onChange={(event) => setFaceValue(event.target.value)}
          placeholder="名义面值（元）"
          aria-label="名义面值"
        />
        <input
          type="number"
          min={1}
          value={validDays}
          onChange={(event) => setValidDays(event.target.value)}
          placeholder="有效天数（可选）"
          aria-label="有效天数"
        />
        <div className={cx(adminStyles, "mp-form-full")}>
          <CouponTierEditor
            benefitType={benefitType}
            tiers={tiers}
            onChange={setTiers}
          />
        </div>
        <button
          className="ui-button ui-button--primary"
          type="submit"
          disabled={pending === "create" || !merchantId || !title.trim() || !faceValue}
        >
          {pending === "create" ? "创建中…" : "新增券模板"}
        </button>
      </form>
    </div>
  );
}
