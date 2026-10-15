"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchApi } from "@/lib/api";
import type { AdminCouponTemplate, AdminMerchant, PaginatedResult } from "../types";
import styles from "../growth.module.css";
import couponStyles from "./campaign-templates.module.css";

export function CampaignTemplatesPanel({
  campaignId,
  editable,
  toggleable,
  onChanged,
}: {
  campaignId: string;
  editable: boolean;
  toggleable: boolean;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<AdminCouponTemplate[] | null>(null);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [title, setTitle] = useState("");
  const [benefitText, setBenefitText] = useState("");
  const [groupName, setGroupName] = useState("");
  const [validDays, setValidDays] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const load = useCallback(async () => {
    const response = await fetchApi<{ items: AdminCouponTemplate[] }>(
      `/admin/campaigns/${campaignId}/templates`
    );
    setTemplates(response.items);
  }, [campaignId]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    Promise.all([
      fetchApi<{ items: AdminCouponTemplate[] }>(`/admin/campaigns/${campaignId}/templates`, {
        signal: controller.signal,
      }),
      fetchApi<PaginatedResult<AdminMerchant>>("/admin/merchants?pageSize=50", {
        signal: controller.signal,
      }),
    ])
      .then(([coupons, shops]) => {
        setTemplates(coupons.items);
        setMerchants(shops.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "加载失败。");
      });
    return () => controller.abort();
  }, [campaignId, retry]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await fetchApi(`/admin/campaigns/${campaignId}/templates`, {
        method: "POST",
        body: JSON.stringify({
          merchantId,
          title: title.trim(),
          benefitText: benefitText.trim(),
          redemptionGroupName: groupName.trim(),
          validDays: validDays ? Number(validDays) : undefined,
          validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        }),
      });
      setTitle("");
      setBenefitText("");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "添加失败。");
    } finally {
      setPending(false);
    }
  }
  async function toggle(template: AdminCouponTemplate) {
    setPending(true);
    setError("");
    try {
      await fetchApi(`/admin/coupon-templates/${template.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !template.isActive }),
      });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.page}>
      <h3>活动优惠券</h3>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="ui-button ui-button--secondary" onClick={() => setRetry((v) => v + 1)}>
            重新加载优惠券
          </button>
        </div>
      )}
      {!editable && (
        <p className={styles.muted}>
          {toggleable
            ? "活动进行中，可启用或停用；优惠内容与互斥组已固定。"
            : "活动已结束，优惠券已统一停用，不能再修改。"}
        </p>
      )}
      {templates === null ? (
        <p role="status">加载中…</p>
      ) : templates.length === 0 ? (
        <p className={styles.muted}>还没有优惠券。</p>
      ) : (
        templates.map((template) => (
          <article className={couponStyles.item} key={template.id}>
            <div className={styles.header}>
              <div>
                <h4>{template.title}</h4>
                <p className={styles.muted}>
                  {template.merchant?.name} · {template.isActive ? "启用" : "停用"}
                </p>
              </div>
              <button
                className="ui-button ui-button--secondary"
                disabled={!toggleable || pending}
                onClick={() => void toggle(template)}
              >
                {template.isActive ? "停用" : "启用"}
              </button>
            </div>
            <p className={couponStyles.text}>{template.benefitText}</p>
            <p className={styles.muted}>
              {template.redemptionGroup
                ? `互斥组：${template.redemptionGroup.name} · 同组任选一张，仅可使用一次`
                : "独立使用"}{" "}
              ·{" "}
              {template.validDays
                ? `领取后 ${template.validDays} 天有效`
                : template.validUntil
                  ? `${new Date(template.validUntil).toLocaleString("zh-CN")} 前有效`
                  : "长期有效"}
            </p>
          </article>
        ))
      )}
      {editable && (
        <form onSubmit={(event) => void create(event)} className={couponStyles.form}>
          <h3>添加优惠券</h3>
          {!merchants.length && (
            <p>
              请先到 <a href="/admin/merchants">合作商家</a> 添加商家。
            </p>
          )}
          <label>
            合作商家
            <select
              aria-label="合作商家"
              required
              value={merchantId}
              disabled={pending}
              onChange={(e) => {
                setMerchantId(e.target.value);
                setGroupName("");
              }}
            >
              <option value="">选择商家…</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            券标题
            <input
              aria-label="券标题"
              required
              maxLength={80}
              value={title}
              disabled={pending}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：满100减15"
            />
          </label>
          <label>
            优惠内容
            <textarea
              aria-label="优惠内容"
              required
              maxLength={4096}
              value={benefitText}
              disabled={pending}
              onChange={(e) => setBenefitText(e.target.value)}
              rows={3}
              placeholder="填写优惠内容和使用条件，例如：满100减15，仅限堂食，不与其他优惠同享。"
            />
          </label>
          <label>
            互斥组
            <input
              aria-label="互斥组"
              maxLength={80}
              list={`groups-${campaignId}`}
              value={groupName}
              disabled={pending}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="可选，不填则独立使用"
            />
          </label>
          <datalist id={`groups-${campaignId}`}>
            {[
              ...new Set(
                templates
                  ?.filter((t) => t.merchantId === merchantId)
                  .map((t) => t.redemptionGroup?.name)
                  .filter(Boolean)
              ),
            ].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className={styles.muted}>
            同一活动、同一商家的同名组，只能任选一张使用。不同档位请分别添加为券，再填写相同组名。
          </p>
          <label>
            领取后有效天数
            <input
              aria-label="领取后有效天数"
              type="number"
              min={1}
              max={3650}
              value={validDays}
              disabled={pending || Boolean(validUntil)}
              onChange={(e) => setValidDays(e.target.value)}
            />
          </label>
          <label>
            固定截止时间
            <input
              aria-label="固定截止时间"
              type="datetime-local"
              value={validUntil}
              disabled={pending || Boolean(validDays)}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </label>
          <p className={styles.muted}>有效期任选一种；都不填为长期有效。</p>
          <button
            className="ui-button ui-button--primary"
            disabled={pending || !merchantId || !title.trim() || !benefitText.trim()}
          >
            添加优惠券
          </button>
        </form>
      )}
    </div>
  );
}
