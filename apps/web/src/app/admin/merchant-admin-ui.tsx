"use client";

import { useState } from "react";
import { COUPON_GIFT_DESCRIPTION_MAX, COUPON_RULE_VERSION } from "@lilink/shared";

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "进行中",
  ENDED: "已结束",
};

export const CAMPAIGN_STATUS_BADGE: Record<string, string> = {
  DRAFT: "is-draft",
  ACTIVE: "is-active",
  ENDED: "is-ended",
};

export const CAMPAIGN_STATUS_OPTIONS = ["DRAFT", "ACTIVE", "ENDED"] as const;

export const BENEFIT_TYPE_LABELS: Record<string, string> = {
  FULL_REDUCTION: "满减",
  DISCOUNT: "折扣",
  GIFT: "赠品",
  CUSTOM: "自定义",
};

export const MERCHANT_ROLE_LABELS: Record<string, string> = {
  OWNER: "店主",
  STAFF: "店员",
};

export function CopyTextButton({
  text,
  label = "复制",
  copiedLabel = "已复制",
  className = "button-secondary ic-copy-btn",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`${className}${copied ? " is-copied" : ""}`}
      onClick={() => void copy()}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

// ── Coupon tiered-rule editor (§A) ─────────────────────────────
// One draft row holds inputs for every benefit kind; the editor shows the ones
// relevant to the chosen benefitType. Amounts are entered in yuan.

export type CouponTierDraft = {
  minSpend: string; // 满（元）
  amountOff: string; // 减（元）— FULL_REDUCTION
  percentOff: string; // 立减 %（1–99）— DISCOUNT
  maxOff: string; // 封顶（元，可选）— DISCOUNT
  gift: string; // 赠品文案 — GIFT
};

export function emptyTierDraft(): CouponTierDraft {
  return { minSpend: "", amountOff: "", percentOff: "", maxOff: "", gift: "" };
}

function yuanToCents(yuan: string): number | null {
  const trimmed = yuan.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Build a coupon rule payload from tier drafts for the given benefitType, or
 * null for CUSTOM. Throws an Error (Chinese message) on invalid input; the
 * server re-validates with validateCouponRule.
 */
export function buildCouponRule(
  benefitType: string,
  tiers: CouponTierDraft[],
): Record<string, unknown> | null {
  if (benefitType === "CUSTOM") return null;
  if (tiers.length === 0) throw new Error("请至少添加一档优惠。");

  const built = tiers.map((tier, index) => {
    const label = `第 ${index + 1} 档`;
    const minSpend = yuanToCents(tier.minSpend);
    if (minSpend == null || minSpend < 0) {
      throw new Error(`${label}门槛金额无效。`);
    }
    let benefit: Record<string, unknown>;
    if (benefitType === "FULL_REDUCTION") {
      const amountOff = yuanToCents(tier.amountOff);
      if (amountOff == null || amountOff <= 0) {
        throw new Error(`${label}减免金额无效。`);
      }
      benefit = { type: "AMOUNT_OFF", amountOff };
    } else if (benefitType === "DISCOUNT") {
      const percentOff = Number(tier.percentOff.trim());
      if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99) {
        throw new Error(`${label}立减比例应为 1–99 的整数。`);
      }
      benefit = { type: "PERCENT_OFF", percentOff };
      if (tier.maxOff.trim() !== "") {
        const maxOff = yuanToCents(tier.maxOff);
        if (maxOff == null || maxOff <= 0) {
          throw new Error(`${label}封顶金额无效。`);
        }
        benefit.maxOff = maxOff;
      }
    } else {
      const gift = tier.gift.trim();
      if (!gift) throw new Error(`${label}赠品内容必填。`);
      benefit = { type: "GIFT", description: gift };
    }
    return { minSpend, benefit };
  });

  return { version: COUPON_RULE_VERSION, tiers: built };
}

export function CouponTierEditor({
  benefitType,
  tiers,
  onChange,
}: {
  benefitType: string;
  tiers: CouponTierDraft[];
  onChange: (tiers: CouponTierDraft[]) => void;
}) {
  if (benefitType === "CUSTOM") {
    return (
      <p className="qb-header-desc mp-tier-custom-note">
        自定义券无结构化规则，优惠说明以券标题展示，核销时不需输入消费金额。
      </p>
    );
  }

  const update = (index: number, patch: Partial<CouponTierDraft>) =>
    onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const add = () => onChange([...tiers, emptyTierDraft()]);
  const remove = (index: number) =>
    onChange(tiers.filter((_, i) => i !== index));

  return (
    <div className="mp-tier-editor">
      <span className="mp-tier-editor-label">优惠阶梯（满 X 时生效，自动取最高达标档）</span>
      {tiers.map((tier, index) => (
        <div className="mp-tier-row" key={index}>
          <input
            type="number"
            min={0}
            step="0.01"
            value={tier.minSpend}
            onChange={(event) => update(index, { minSpend: event.target.value })}
            placeholder="满（元）"
            aria-label={`第 ${index + 1} 档门槛金额`}
          />
          {benefitType === "FULL_REDUCTION" && (
            <input
              type="number"
              min={0}
              step="0.01"
              value={tier.amountOff}
              onChange={(event) => update(index, { amountOff: event.target.value })}
              placeholder="减（元）"
              aria-label={`第 ${index + 1} 档减免金额`}
            />
          )}
          {benefitType === "DISCOUNT" && (
            <>
              <input
                type="number"
                min={1}
                max={99}
                step="1"
                value={tier.percentOff}
                onChange={(event) =>
                  update(index, { percentOff: event.target.value })
                }
                placeholder="立减 %（如 20）"
                aria-label={`第 ${index + 1} 档立减比例`}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={tier.maxOff}
                onChange={(event) => update(index, { maxOff: event.target.value })}
                placeholder="封顶（元，可选）"
                aria-label={`第 ${index + 1} 档封顶金额`}
              />
            </>
          )}
          {benefitType === "GIFT" && (
            <input
              value={tier.gift}
              maxLength={COUPON_GIFT_DESCRIPTION_MAX}
              onChange={(event) => update(index, { gift: event.target.value })}
              placeholder="赠品，如 一杯气泡饮料"
              aria-label={`第 ${index + 1} 档赠品`}
            />
          )}
          <button
            type="button"
            className="button-secondary mp-tier-remove"
            onClick={() => remove(index)}
            disabled={tiers.length <= 1}
            aria-label={`删除第 ${index + 1} 档`}
          >
            删除
          </button>
        </div>
      ))}
      <button type="button" className="button-secondary mp-tier-add" onClick={add}>
        + 添加一档
      </button>
    </div>
  );
}

export function AdminRefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="button-secondary mp-refresh-btn"
      onClick={onClick}
      type="button"
    >
      刷新
    </button>
  );
}
