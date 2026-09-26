"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { dcx } from "../_lib/dashboard-class-names";
import { ClipboardIcon } from "../_components/icons";
import { fetchCouponAgendaReadState, type AuthMePayload, type CouponAgendaReadState, type CouponOverview, type MyCoupon } from "@/lib/api";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { cacheDashboardCouponAgendaRead } from "../_lib/coupon-agenda-read-cache";
import { useCouponReadVisibility } from "./useCouponReadVisibility";
import { useCouponsData } from "./use-coupons-data";
import { CouponCard } from "./coupon-card";
import { CouponCodeDialog } from "./coupon-code-dialog";

function CouponsEmptyState() {
  return (
    <div className={dcx("coupons-empty")} role="status">
      <span className={dcx("coupons-empty-icon")} aria-hidden="true">
        <ClipboardIcon />
      </span>
      <p className={dcx("coupons-empty-title")}>暂无可用优惠券</p>
      <p className={dcx("coupons-empty-desc")}>
        完善资料并报名匹配周期后，系统会自动为你发放商家优惠。
      </p>
    </div>
  );
}

function CouponsPanel({
  title,
  description,
  count,
  children,
  muted = false,
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={dcx(`coupons-panel${muted ? " is-muted" : ""}`)}
      aria-label={title}
    >
      <div className={dcx("coupons-panel-head")}>
        <div className={dcx("coupons-panel-head-main")}>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={dcx("coupons-panel-count")}>已显示 {count} 张</span>
      </div>
      {children}
    </section>
  );
}

export function CouponsClient({ initialUser, initialOverview = null, initialError = null }: {
  initialUser: AuthMePayload;
  initialOverview?: CouponOverview | null;
  initialError?: string | null;
}) {
  useDashboardSessionSeed(initialUser);
  const currentUserId = initialUser.id;
  const [couponReadState, setCouponReadState] = useState<CouponAgendaReadState | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<MyCoupon | null>(null);
  const onAuthorizationLost = useCallback(() => setSelectedCoupon(null), []);
  const { data, authenticationRequired, loading, loadingMore, error, refresh, loadMore, updateStatus } = useCouponsData(initialOverview, initialError, onAuthorizationLost);
  useEffect(() => {
    // Remove secrets persisted by older clients without reading their values.
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith("lilink:coupon-secret:"));
      keys.forEach(key => localStorage.removeItem(key));
    } catch { /* Storage may be disabled. */ }
    let active = true;
    fetchCouponAgendaReadState().then(state => {
      if (active) setCouponReadState(state);
    }).catch(() => {
      // Read tracking is retried by the visibility observer when cards are shown.
    });
    return () => { active = false; };
  }, []);
  const issued = data?.available.items ?? [];
  const archived = data?.history.items ?? [];
  const handleCouponReadMarked = useCallback((state: CouponAgendaReadState) => {
    setCouponReadState(state);
    cacheDashboardCouponAgendaRead(state, currentUserId);
  }, [currentUserId]);
  const couponReadRef = useCouponReadVisibility<HTMLDivElement>({
    enabled: Boolean(currentUserId && issued.length > 0 && (couponReadState == null || (!couponReadState.read && couponReadState.unreadAvailableCount > 0))),
    onMarkedRead: handleCouponReadMarked,
  });

  if (authenticationRequired) return <section className="ui-card ui-card--padded">
    <p role="alert">登录状态已失效，请重新登录。</p>
    <a className="ui-button ui-button--primary" href="/login">重新登录</a>
  </section>;

  return (
    <div className={dcx("app-page-shell v2-page-shell coupons-page")}>
      <header className={dcx("v2-page-header coupons-header")}>
        <span className={dcx("v2-page-header-eyebrow")}><ClipboardIcon className={dcx("coupons-header-icon")} />商家优惠</span>
        <h1>我的优惠券</h1>
        <p>向商家出示核销码即可使用</p>
        <button type="button" className="ui-button ui-button--secondary" disabled={loading} onClick={() => void refresh()}>{loading && data ? "正在更新…" : "刷新优惠券"}</button>
      </header>
      {error && <div role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={() => void refresh()}>重试加载优惠券</button></div>}
      {loading && !data && <div className={dcx("me-state")} role="status"><span className={dcx("me-state-spinner")} />加载中……</div>}
      {data && <div ref={couponReadRef} className={dcx("coupons-main")}>
        <CouponsPanel title="可用优惠券" description="到店消费时，向商家出示下方核销码即可抵扣" count={issued.length}>
          {issued.length === 0 ? <CouponsEmptyState /> : <div className={dcx("coupons-list")}>
            {issued.map(coupon => <CouponCard key={coupon.id} coupon={coupon} onShowCode={() => setSelectedCoupon(coupon)} />)}
          </div>}
          {data.available.nextCursor && <button type="button" className="ui-button ui-button--secondary" disabled={loading || loadingMore.available} onClick={() => void loadMore("available")}>{loadingMore.available ? "正在加载更多…" : "加载更多可用优惠券"}</button>}
        </CouponsPanel>
        {archived.length > 0 && <CouponsPanel title="历史记录" description="已使用或过期的优惠券" count={archived.length} muted>
          <div className={dcx("coupons-list")}>
            {archived.map(coupon => <CouponCard key={coupon.id} coupon={coupon} archived />)}
          </div>
          {data.history.nextCursor && <button type="button" className="ui-button ui-button--secondary" disabled={loading || loadingMore.history} onClick={() => void loadMore("history")}>{loadingMore.history ? "正在加载更多…" : "加载更多历史优惠券"}</button>}
        </CouponsPanel>}
      </div>}
      {selectedCoupon && <CouponCodeDialog key={selectedCoupon.id} coupon={selectedCoupon} onClose={() => setSelectedCoupon(null)} onStatus={updateStatus} />}
    </div>
  );
}
