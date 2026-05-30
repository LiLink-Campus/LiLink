// Placeholder product-analytics figures for the ops dashboard preview.
// These are illustrative numbers only and are NOT real data.
//
// They mirror the event taxonomy from PR #66 / issue #65 so that wiring the
// real source is a 1:1 swap: replace these constants with the response of a
// future `GET /admin/analytics/product-funnels` aggregation endpoint (which
// must exclude `User.isTest` server-side). Until that endpoint exists, the
// "产品行为分析" section renders these and is badged as sample data in the UI.

import type { FunnelStep } from "./FunnelPanel";
import type { KpiTile } from "./KpiStrip";

export const SAMPLE_KPI_TILES: KpiTile[] = [
  {
    key: "active7d",
    label: "活跃用户 · 近 7 天",
    value: "1,248",
    delta: { text: "8.4%", trend: "up" },
    hint: "页面到达去重",
  },
  {
    key: "optinRate",
    label: "报名转化率",
    value: "38.2%",
    delta: { text: "2.1%", trend: "up" },
  },
  {
    key: "couponRate",
    label: "优惠券兑换率",
    value: "24.0%",
    delta: { text: "1.3%", trend: "down" },
  },
  {
    key: "meetupRate",
    label: "约见完成率",
    value: "61.5%",
    delta: { text: "5.0%", trend: "up" },
  },
  {
    key: "events7d",
    label: "事件总数 · 近 7 天",
    value: "8,432",
    hint: "footprint + intent + outcome",
  },
  {
    key: "newToday",
    label: "今日新增事件",
    value: "+1,204",
    delta: { text: "环比 12%", trend: "up" },
  },
];

// coupon_page_viewed → coupon_redeem_code_open_clicked →
// coupon_redeem_code_displayed → coupon_redeemed
export const SAMPLE_COUPON_FUNNEL: FunnelStep[] = [
  { key: "view", label: "优惠券页浏览", value: 1000, kind: "footprint" },
  { key: "open", label: "点击取码", value: 620, kind: "intent" },
  { key: "display", label: "兑换码展示", value: 540, kind: "footprint" },
  { key: "redeemed", label: "完成兑换", value: 240, kind: "outcome" },
];

// meetup_entry_clicked → meetup_flow_viewed →
// meetup_proposal_submit_clicked → meetup_option_accepted →
// meetup_final_confirmed
export const SAMPLE_MEETUP_FUNNEL: FunnelStep[] = [
  { key: "entry", label: "约见入口点击", value: 600, kind: "intent" },
  { key: "flow", label: "约见流程曝光", value: 470, kind: "footprint" },
  { key: "proposal", label: "提交提案", value: 320, kind: "intent" },
  { key: "accepted", label: "接受选项", value: 180, kind: "outcome" },
  { key: "confirmed", label: "最终确认", value: 110, kind: "outcome" },
];
