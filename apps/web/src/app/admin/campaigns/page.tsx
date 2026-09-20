"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { renderBenefitText, type CouponBenefitType, type CouponRule } from "@lilink/shared";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import cardStyles from "../admin-card.module.css";
import {
  AdminRefreshButton,
  BENEFIT_TYPE_LABELS,
  buildCouponRule,
  CAMPAIGN_STATUS_LABELS,
  CouponTierEditor,
  emptyTierDraft,
  type CouponTierDraft,
} from "../merchant-admin-ui";
import { useAdminCollection } from "../use-admin-collection";
import type { AdminCampaign, AdminCouponTemplate, AdminMerchant, PaginatedResult } from "../types";
import merchantStyles from "../merchant-admin.module.css";

import type { PromotionRedemptionRow } from "../types";
import styles from "../growth.module.css";
import { AdminDetailDialog } from "../admin-detail-dialog";

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
  const [revision, setRevision] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"coupons" | "results">("coupons");
  const [active, setActive] = useState<AdminCampaign | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const {
    data,
    loading,
    error: loadError,
    refresh,
  } = useAdminCollection<AdminCampaign>("/admin/campaigns", {
    page,
    pageSize: 20,
    status: statusFilter || undefined,
  });
  const campaigns = useMemo(() => data?.items ?? [], [data]);
  const selected =
    campaigns.find((c) => c.id === selectedId) ??
    campaigns.find((c) => c.status === "ACTIVE") ??
    campaigns[0];
  const loadActive = useCallback(async () => {
    try {
      const result = await fetchApi<PaginatedResult<AdminCampaign>>(
        "/admin/campaigns?status=ACTIVE&pageSize=1"
      );
      setActiveCount(result.total);
      setActive(result.total === 1 ? (result.items[0] ?? null) : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "当前活动加载失败");
    }
  }, []);
  useEffect(() => {
    void loadActive();
  }, [loadActive]);
  async function reload() {
    setRevision((value) => value + 1);
    await Promise.all([refresh(), loadActive()]);
  }
  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await fetchApi<AdminCampaign>("/admin/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      setName("");
      setDescription("");
      setCreating(false);
      setStatusFilter("");
      setPage(1);
      setSelectedId(created.id);
      setTab("coupons");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败");
    } finally {
      setPending(false);
    }
  }
  async function changeStatus(campaign: AdminCampaign, status: "ACTIVE" | "ENDED") {
    if (
      status === "ENDED" &&
      !window.confirm(`结束「${campaign.name}」？停止发放新券，已发优惠券仍按各自有效期使用。`)
    )
      return;
    setPending(true);
    setError(null);
    try {
      await fetchApi(`/admin/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>商户活动</h1>
          <p className={styles.muted}>准备优惠券 → 发布活动 → 查看发放与核销</p>
        </div>
        <div className={styles.toolbar}>
          <button
            className="ui-button ui-button--primary"
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
          >
            新建活动
          </button>
          <AdminRefreshButton onClick={() => void reload()} disabled={loading} />
        </div>
      </header>
      {!creating && (error || loadError) && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {error || loadError}
        </p>
      )}
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <span className={styles.badge}>当前活动</span>
            <h2 style={{ marginTop: 12 }}>
              {activeCount > 1 ? "需要确认当前活动" : (active?.name ?? "暂无进行中的活动")}
            </h2>
          </div>
          {active && (
            <button
              className="ui-button ui-button--secondary"
              disabled={pending}
              onClick={() => void changeStatus(active, "ENDED")}
            >
              结束活动
            </button>
          )}
        </div>
        {activeCount > 1 && (
          <div role="alert">
            <p className="ui-form-message ui-form-message--error">
              检测到 {activeCount}{" "}
              个进行中的历史活动，新增发券已暂停。请在下方结束多余活动，仅保留一场后恢复发券；已有优惠券和核销记录保留。
            </p>
            <button
              className="ui-button ui-button--secondary"
              onClick={() => {
                setStatusFilter("ACTIVE");
                setPage(1);
                setSelectedId(null);
              }}
            >
              查看待确认的活动
            </button>
          </div>
        )}
        <p className={styles.muted}>
          同一时间全站只进行一场活动，新老用户均可参加。提交问卷并首次报名匹配后，可在优惠券页领取，每人每场一次。
        </p>
        <p className={styles.muted}>邀请推广长期独立运行；没有活动时也能正常邀请和统计。</p>
      </section>
      <section className={styles.panel}>
        <h2>活动列表</h2>
        <div className={styles.filters}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              aria-pressed={statusFilter === t.value}
              onClick={() => {
                setStatusFilter(t.value);
                setPage(1);
                setSelectedId(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {loading ? (
          <p className={styles.empty}>加载活动…</p>
        ) : campaigns.length === 0 ? (
          <p className={styles.empty}>
            {statusFilter
              ? "这个状态下暂无活动。"
              : "还没有商户活动。先新建活动，再添加合作商家的优惠券。"}
          </p>
        ) : (
          <div className={styles.list}>
            {campaigns.map((c) => (
              <button
                className={styles.item}
                key={c.id}
                aria-pressed={selected?.id === c.id}
                onClick={() => {
                  setSelectedId(c.id);
                  setTab("coupons");
                }}
              >
                <div>
                  <strong>{c.name}</strong>
                  <p className={styles.muted}>
                    {c.templateCount} 种优惠券{c.description ? ` · ${c.description}` : ""}
                  </p>
                </div>
                <span className={styles.badge}>{CAMPAIGN_STATUS_LABELS[c.status]}</span>
              </button>
            ))}
          </div>
        )}
        {data && data.totalPages > 1 && (
          <AdminPagination
            className={cx(adminStyles, "admin-pagination")}
            page={page}
            totalPages={data.totalPages}
            total={data.total}
            unit="个活动"
            onPageChange={setPage}
          />
        )}
      </section>
      {selected && (
        <section className={styles.panel}>
          <div className={styles.header}>
            <div>
              <h2>{selected.name}</h2>
              <p className={styles.muted}>
                {selected.status === "DRAFT"
                  ? "添加优惠券后发布，全站符合条件的用户即可领取。"
                  : selected.status === "ACTIVE"
                    ? activeCount > 1
                      ? "新增发券已暂停。请结束多余活动，仅保留需要继续进行的一场。"
                      : "活动进行中，每位用户只领取一次。"
                    : "活动已结束，保留优惠券与核销记录。"}
              </p>
            </div>
            {selected.status === "DRAFT" && (
              <button
                className="ui-button ui-button--primary"
                disabled={pending || activeCount > 0}
                onClick={() => void changeStatus(selected, "ACTIVE")}
              >
                {activeCount > 0 ? "请先结束当前活动" : "发布活动"}
              </button>
            )}
            {selected.status === "ACTIVE" && activeCount > 1 && (
              <button
                className="ui-button ui-button--secondary"
                disabled={pending}
                onClick={() => void changeStatus(selected, "ENDED")}
              >
                结束此活动
              </button>
            )}
          </div>
          <div className={styles.filters}>
            <button aria-pressed={tab === "coupons"} onClick={() => setTab("coupons")}>
              优惠券配置
            </button>
            <button aria-pressed={tab === "results"} onClick={() => setTab("results")}>
              发放与核销
            </button>
          </div>
          {tab === "coupons" ? (
            <CampaignTemplatesPanel
              key={`${selected.id}-${revision}`}
              campaignId={selected.id}
              editable={selected.status === "DRAFT"}
              onChanged={() => void refresh()}
            />
          ) : (
            <CampaignResults key={`${selected.id}-${revision}`} campaignId={selected.id} />
          )}
        </section>
      )}
      <AdminDetailDialog
        open={creating}
        onClose={() => {
          if (!pending) setCreating(false);
        }}
        title="新建活动"
        headerLabel="商户活动"
      >
        <form className={styles.form} onSubmit={createCampaign}>
          <h2>新建活动</h2>
          <p className={styles.muted}>先保存草稿，再配置优惠券。发布后向所有符合条件的用户开放。</p>
          <label>
            活动名称
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：秋日校园福利"
            />
          </label>
          <label>
            活动说明（可选）
            <textarea
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>
          {error && (
            <p role="alert" className="ui-form-message ui-form-message--error">
              {error}
            </p>
          )}
          <button className="ui-button ui-button--primary" disabled={pending || !name.trim()}>
            {pending ? "保存中…" : "保存草稿并配置优惠券"}
          </button>
        </form>
      </AdminDetailDialog>
    </div>
  );
}

type Results = {
  recipients: number;
  issued: number;
  redeemed: number;
  expired: number;
  templates: { title: string; merchant: string; issued: number; redeemed: number }[];
};
function CampaignResults({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetchApi<Results>(`/admin/campaigns/${campaignId}/results`)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [campaignId]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p className={styles.empty}>加载发放结果…</p>;
  return (
    <div className={styles.page}>
      <p className={styles.muted}>
        本活动累计数据，排除测试账号。保留历史发放与核销记录，与邀请来源无关。
      </p>
      <div className={styles.metrics}>
        {[
          ["领券人数", data.recipients],
          ["已发券数", data.issued],
          ["已核销券数", data.redeemed],
          ["已过期未用", data.expired],
        ].map(([label, value]) => (
          <div className={styles.metric} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {data.templates.length ? (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>优惠券 / 商家</th>
                <th>已发放</th>
                <th>已核销</th>
              </tr>
            </thead>
            <tbody>
              {data.templates.map((t, i) => (
                <tr key={i}>
                  <td>
                    {t.title}
                    <p className={styles.muted}>{t.merchant}</p>
                  </td>
                  <td>{t.issued}</td>
                  <td>{t.redeemed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>
          还没有发放记录。活动发布后，符合条件的用户领取时会在这里累计。
        </p>
      )}
      <CampaignRedemptions campaignId={campaignId} />
    </div>
  );
}

function CampaignRedemptions({ campaignId }: { campaignId: string }) {
  const day = (offset: number) =>
    new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(() => day(-29));
  const [to, setTo] = useState(() => day(0));
  const [range, setRange] = useState(() => ({ from: day(-29), to: day(0) }));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResult<PromotionRedemptionRow> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    const params = new URLSearchParams({
      campaignId,
      page: String(page),
      pageSize: "20",
      from: new Date(`${range.from}T00:00:00+08:00`).toISOString(),
      to: new Date(new Date(`${range.to}T00:00:00+08:00`).getTime() + 86400000).toISOString(),
    });
    fetchApi<PaginatedResult<PromotionRedemptionRow>>(`/admin/promotion/redemptions?${params}`)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [campaignId, page, range]);
  return (
    <section>
      <h3>核销对账</h3>
      <p className={styles.muted}>
        按商家与北京时间日期汇总。名义面值不代表实际结算金额；每次最多查询 370 天。
      </p>
      <form
        className={styles.toolbar}
        style={{ marginTop: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (from && to && from <= to) {
            setPage(1);
            setRange({ from, to });
          }
        }}
      >
        <label>
          开始日期{" "}
          <input
            aria-label="对账开始日期"
            type="date"
            required
            max={to}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          结束日期{" "}
          <input
            aria-label="对账结束日期"
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="ui-button ui-button--secondary" disabled={!from || !to || from > to}>
          查询对账
        </button>
      </form>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p className={styles.empty}>加载对账记录…</p>
      ) : !data.items.length ? (
        <p className={styles.empty}>这段时间没有核销记录。</p>
      ) : (
        <>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>商家</th>
                  <th>核销数</th>
                  <th>名义面值</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={`${r.merchantId}-${r.day}`}>
                    <td>{r.day}</td>
                    <td>{r.merchantName}</td>
                    <td>{r.count}</td>
                    <td>¥{(r.faceValueTotal / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <AdminPagination
              className={cx(adminStyles, "admin-pagination")}
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              unit="条记录"
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

function CampaignTemplatesPanel({
  campaignId,
  editable,
  onChanged,
}: {
  campaignId: string;
  editable: boolean;
  onChanged: () => void;
}) {
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
        `/admin/campaigns/${campaignId}/templates`
      );
      setTemplates(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载券包失败。");
    }
  }, [campaignId]);

  useEffect(() => {
    void loadTemplates();
    void fetchApi<PaginatedResult<AdminMerchant>>("/admin/merchants?pageSize=50&status=active")
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
      onChanged();
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
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={cx(adminStyles, "qb-subpanel")}>
      {error && <p className="ui-form-message ui-form-message--error">{error}</p>}

      <h4>活动优惠券</h4>
      {!editable && <p className={styles.muted}>发布后固定优惠券配置；新福利请放入下一场活动。</p>}
      {templates === null ? (
        <p className={cx(adminStyles, "qb-header-desc")}>加载中…</p>
      ) : templates.length === 0 ? (
        <p className={cx(adminStyles, "qb-header-desc")}>
          还没有优惠券，先在下方选择合作商家并添加优惠。
        </p>
      ) : (
        <div className={cx(adminStyles, "mp-subpanel-list")}>
          {templates.map((template) => (
            <div key={template.id} className={cx(adminStyles, "mp-subpanel-row")}>
              <div className={cx(adminStyles, "mp-subpanel-row-main")}>
                <span className={cx(adminStyles, "mp-subpanel-row-title")}>{template.title}</span>
                <span className={cx(adminStyles, "mp-subpanel-row-meta")}>
                  {template.merchant?.name ?? template.merchantId} ·{" "}
                  {BENEFIT_TYPE_LABELS[template.benefitType] ?? template.benefitType} · 面值{" "}
                  {(template.faceValue / 100).toFixed(2)} 元
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
                    template.isActive ? "is-active" : "is-off"
                  )}
                >
                  {template.isActive ? "启用" : "停用"}
                </span>
                <button
                  type="button"
                  className="ui-button ui-button--secondary"
                  disabled={!editable || pending === `tpl-${template.id}`}
                  onClick={() => void toggleTemplate(template)}
                >
                  {template.isActive ? "停用" : "启用"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editable && (
        <>
          <h4 className={cx(adminStyles, "campaign-subheading")}>添加优惠券</h4>
          {merchants.length === 0 && (
            <p className={styles.muted}>
              请先到 <a href="/admin/merchants">合作商家</a> 添加并启用商家。
            </p>
          )}
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
              <CouponTierEditor benefitType={benefitType} tiers={tiers} onChange={setTiers} />
            </div>
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={pending === "create" || !merchantId || !title.trim() || !faceValue}
            >
              {pending === "create" ? "创建中…" : "添加优惠券"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
