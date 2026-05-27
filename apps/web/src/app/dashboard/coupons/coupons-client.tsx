"use client";

import dynamic from "next/dynamic";
import { dcx } from "../_lib/dashboard-class-names";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { generateTotpToken, formatRedeemCode, COUPON_TOTP } from "@lilink/shared";
import type { MerchantPromotionBlock } from "@lilink/shared";
import { ClipboardIcon } from "../_components/icons";
import {
  fetchMyCoupons,
  fetchCouponAgendaReadState,
  getCouponRedeemSecret,
  getCouponStatus,
  isApiRequestError,
  type MyCoupon,
  type CouponAgendaReadState,
  type CouponRedeemSecret,
  type CouponStatusResponse,
} from "../../../lib/api";
import { getClientWebOrigin } from "../../../lib/api-base-url";
import { formatYuan } from "../../../lib/format";
import { cacheDashboardCouponAgendaRead } from "../_lib/coupon-agenda-read-cache";
import { useCouponReadVisibility } from "./useCouponReadVisibility";

const QrCode = dynamic(
  () => import("../../../components/qr-code").then((m) => m.QrCode),
  { ssr: false },
);

const STATUS_LABELS: Record<string, string> = {
  ISSUED: "可用",
  REDEEMED: "已使用",
  EXPIRED: "已过期",
  VOID: "已作废",
};

function debugCouponRead(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[LiLink coupons] ${message}`);
  }
}

function formatExpiry(iso: string | null) {
  if (!iso) return "长期有效";
  return `${new Date(iso).toLocaleDateString("zh-CN")} 前有效`;
}

/** Seconds remaining until the next TOTP period boundary. */
function secsToNextPeriod(at: number = Date.now()) {
  const period = COUPON_TOTP.period;
  const elapsed = Math.floor(at / 1000) % period;
  return period - elapsed;
}

/** localStorage cache for the per-coupon redeem secret. */
const CACHE_PREFIX = "lilink:coupon-secret:";
function readCachedSecret(couponId: string): CouponRedeemSecret | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${couponId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CouponRedeemSecret;
  } catch {
    return null;
  }
}
function writeCachedSecret(couponId: string, data: CouponRedeemSecret) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${couponId}`, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; continue without caching.
  }
}

// -------------------------------------------------------------------
// Coupon card
// -------------------------------------------------------------------

function CouponCard({
  coupon,
  archived = false,
  onShowCode,
}: {
  coupon: MyCoupon;
  archived?: boolean;
  onShowCode?: () => void;
}) {
  const showBenefit =
    !archived &&
    Boolean(coupon.benefitText) &&
    coupon.benefitText !== coupon.title;

  return (
    <article
      className={dcx(`coupons-card${archived ? " is-archived" : ""}`)}
      aria-label={coupon.title}
    >
      <div className={dcx("coupons-card-main")}>
        <div className={dcx("coupons-card-head")}>
          <p className={dcx("coupons-card-title")}>{coupon.title}</p>
        </div>
        <div className={dcx("coupons-card-meta")}>
          <span className={dcx("coupons-card-merchant")}>{coupon.merchantName}</span>
          {!archived ? (
            <>
              <span className={dcx("coupons-card-meta-sep")} aria-hidden="true">
                ·
              </span>
              <span className={dcx("coupons-card-expiry")}>
                {formatExpiry(coupon.expiresAt)}
              </span>
            </>
          ) : null}
        </div>
        {showBenefit ? (
          <ul className={dcx("coupons-card-benefit-list")}>
            {coupon.benefitText.split(" ｜ ").map((tier, index) => (
              <li key={index} className={dcx("coupons-card-benefit-tier")}>
                {tier}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={dcx("coupons-card-actions")}>
        <span className={dcx(`coupons-badge${archived ? " is-muted" : ""}`)}>
          {archived
            ? (STATUS_LABELS[coupon.status] ?? coupon.status)
            : "可用"}
        </span>
        {!archived ? (
          <button
            type="button"
            className={dcx("ui-button ui-button--primary coupons-use-btn")}
            onClick={onShowCode}
          >
            查看核销码
          </button>
        ) : null}
      </div>
    </article>
  );
}

// -------------------------------------------------------------------
// Promotion blocks renderer
// -------------------------------------------------------------------

function PromotionBlock({ block }: { block: MerchantPromotionBlock }) {
  if (block.type === "TEXT") {
    return (
      <div className={dcx("coupons-redeemed-promo-block")}>
        <p>{block.text}</p>
      </div>
    );
  }
  return (
    <div className={dcx("coupons-redeemed-promo-block")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.imageUrl}
        alt={block.caption ?? (block.type === "QRCODE" ? "商家二维码" : "推广图片")}
        className={dcx("coupons-redeemed-promo-img")}
      />
      {block.caption ? (
        <p className={dcx("coupons-redeemed-promo-caption")}>{block.caption}</p>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------
// Success view (coupon has been REDEEMED)
// -------------------------------------------------------------------

function RedeemedView({
  applied,
  merchantPromotion,
  onClose,
}: {
  applied: CouponStatusResponse["applied"];
  merchantPromotion: MerchantPromotionBlock[] | undefined;
  onClose: () => void;
}) {
  const hasDiscount = applied && applied.discountAmount > 0;
  const hasGift = applied?.gift;

  return (
    <div className={dcx("coupons-redeemed-success")}>
      <span className={dcx("coupons-redeemed-icon")} aria-hidden="true">
        ✅
      </span>
      <p className={dcx("coupons-redeemed-title")}>核销成功</p>

      {hasDiscount ? (
        <p className={dcx("coupons-redeemed-applied")}>
          {applied.orderAmount != null ? (
            <>消费 {formatYuan(applied.orderAmount)} 元，</>
          ) : null}
          优惠 {formatYuan(applied.discountAmount)} 元
        </p>
      ) : null}

      {hasGift ? (
        <p className={dcx("coupons-redeemed-applied")}>赠品：{applied!.gift}</p>
      ) : null}

      {merchantPromotion && merchantPromotion.length > 0 ? (
        <div className={dcx("coupons-redeemed-promotion")}>
          {merchantPromotion.map((block, idx) => (
            <PromotionBlock key={idx} block={block} />
          ))}
        </div>
      ) : null}

      <button
        className={dcx("ui-button ui-button--primary coupons-dialog-close")}
        onClick={onClose}
        type="button"
      >
        完成
      </button>
    </div>
  );
}

// -------------------------------------------------------------------
// Show-code dialog (TOTP token + QR code + status polling)
// -------------------------------------------------------------------

type DialogState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "not-redeemable" }
  | { phase: "active"; secret: CouponRedeemSecret; token: string; secs: number }
  | { phase: "redeemed"; status: CouponStatusResponse }
  | { phase: "expired-or-void"; reason: "EXPIRED" | "VOID" };

function CouponCodeDialog({
  coupon,
  onClose,
}: {
  coupon: MyCoupon | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<DialogState>({ phase: "loading" });
  // Keep mutable refs to avoid stale-closure issues in intervals.
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Open / close the native dialog.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (coupon) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [coupon]);

  const stopTimers = useCallback(() => {
    if (tickIntervalRef.current !== null) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // 1-second tick that refreshes the TOTP token + countdown.
  const startTick = useCallback((secret: CouponRedeemSecret) => {
    const tick = () => {
      const now = Date.now();
      const token = generateTotpToken(secret.secret, now);
      const secs = secsToNextPeriod(now);
      setState({ phase: "active", secret, token, secs });
    };
    tick();
    tickIntervalRef.current = setInterval(tick, 1000);
  }, []);

  // Poll the status endpoint every 2.5s; stop on a terminal status.
  const startPolling = useCallback(
    (couponId: string) => {
      const poll = async () => {
        try {
          const statusResponse = await getCouponStatus(couponId);
          if (statusResponse.status === "REDEEMED") {
            stopTimers();
            setState({ phase: "redeemed", status: statusResponse });
          } else if (
            statusResponse.status === "EXPIRED" ||
            statusResponse.status === "VOID"
          ) {
            stopTimers();
            setState({ phase: "expired-or-void", reason: statusResponse.status });
          }
        } catch {
          // Polling errors are non-fatal; retry next interval.
        }
      };
      pollIntervalRef.current = setInterval(poll, 2500);
    },
    [stopTimers],
  );

  // Load the secret on open, tear everything down on close/unmount.
  useEffect(() => {
    if (!coupon) {
      stopTimers();
      setState({ phase: "loading" });
      return;
    }

    let active = true;
    setState({ phase: "loading" });

    // Try the local cache first.
    const cached = readCachedSecret(coupon.id);
    if (cached) {
      startTick(cached);
      startPolling(coupon.id);
      return () => {
        active = false; // mark stale
        stopTimers();
      };
    }

    getCouponRedeemSecret(coupon.id)
      .then((data) => {
        if (!active) return;
        writeCachedSecret(coupon.id, data);
        startTick(data);
        startPolling(coupon.id);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (isApiRequestError(err) && err.status === 404) {
          setState({ phase: "not-redeemable" });
        } else {
          setState({
            phase: "error",
            message: err instanceof Error ? err.message : "加载失败",
          });
        }
      });

    return () => {
      active = false;
      stopTimers();
    };
  }, [coupon, startTick, startPolling, stopTimers]);

  if (!coupon) return null;

  const origin = getClientWebOrigin();

  function buildQrValue(code: string, token: string) {
    return `${origin}/r/${code}#t=${token}`;
  }

  return (
    <dialog
      ref={dialogRef}
      className={dcx("coupons-dialog")}
      onClose={onClose}
      aria-labelledby="coupons-dialog-title"
    >
      <div className={dcx("coupons-dialog-inner")}>
        <div className={dcx("coupons-dialog-header")}>
          <h2 id="coupons-dialog-title" className={dcx("coupons-dialog-title")}>
            {coupon.title}
          </h2>
          <p className={dcx("coupons-dialog-merchant")}>{coupon.merchantName}</p>
        </div>

        <div className={dcx("coupons-dialog-body")}>
          {state.phase === "loading" ? (
            <div className={dcx("me-state")}>
              <span className={dcx("me-state-spinner")} />
              <span>加载中……</span>
            </div>
          ) : state.phase === "error" ? (
            <p
              className={dcx("coupons-dialog-hint")}
              style={{ color: "var(--color-danger)" }}
            >
              {state.message}
            </p>
          ) : state.phase === "not-redeemable" ? (
            <p className={dcx("coupons-dialog-hint")}>
              该券暂不支持扫码核销，请向店员报出券码。
            </p>
          ) : state.phase === "redeemed" ? (
            <RedeemedView
              applied={state.status.applied}
              merchantPromotion={state.status.merchantPromotion}
              onClose={onClose}
            />
          ) : state.phase === "expired-or-void" ? (
            <div className={dcx("coupons-redeemed-success")}>
              <span className={dcx("coupons-redeemed-icon")} aria-hidden="true">
                {state.reason === "EXPIRED" ? "⏰" : "🚫"}
              </span>
              <p className={dcx("coupons-redeemed-title")}>
                {state.reason === "EXPIRED" ? "优惠券已过期" : "优惠券已作废"}
              </p>
              <p className={dcx("coupons-dialog-hint")}>该优惠券无法再使用，请关闭。</p>
              <button
                className={dcx("ui-button ui-button--primary coupons-dialog-close")}
                onClick={onClose}
                type="button"
              >
                关闭
              </button>
            </div>
          ) : (
            // phase === "active"
            <>
              <div className={dcx("coupons-showcode-qr")}>
                <QrCode value={buildQrValue(state.secret.code, state.token)} size={180} />
              </div>

              <div className={dcx("coupons-showcode-code")}>
                <span className={dcx("coupons-showcode-code-label")}>核销码</span>
                <code className={dcx("coupons-showcode-code-value")}>
                  {formatRedeemCode(state.secret.code, state.token)}
                </code>
                <span className={dcx("coupons-showcode-countdown")}>
                  {state.secs}
                  <span className={dcx("coupons-showcode-countdown-secs")}> 秒</span>
                  后刷新
                </span>
              </div>

              <p className={dcx("coupons-dialog-hint")}>请向店员出示此核销码</p>

              <button
                className={dcx("ui-button ui-button--primary coupons-dialog-close")}
                onClick={onClose}
                type="button"
              >
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

// -------------------------------------------------------------------
// Page-level components
// -------------------------------------------------------------------

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
        <span className={dcx("coupons-panel-count")}>{count} 张</span>
      </div>
      {children}
    </section>
  );
}

export function CouponsClient({
  initialCoupons = null,
}: {
  initialCoupons?: MyCoupon[] | null;
}) {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(initialCoupons);
  const [couponReadState, setCouponReadState] =
    useState<CouponAgendaReadState | null>(null);
  const [loading, setLoading] = useState(initialCoupons === null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<MyCoupon | null>(null);

  useEffect(() => {
    // Server already provided the list; skip the redundant client fetch.
    if (initialCoupons !== null) {
      return;
    }
    let active = true;
    fetchMyCoupons()
      .then((couponResult) => {
        if (!active) return;
        setCoupons(couponResult.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCoupons]);

  useEffect(() => {
    let active = true;
    fetchCouponAgendaReadState()
      .then((readState) => {
        if (active) setCouponReadState(readState);
      })
      .catch(() => {
        debugCouponRead("read-state load failed");
      });
    return () => {
      active = false;
    };
  }, []);

  const issued = coupons?.filter((coupon) => coupon.status === "ISSUED") ?? [];
  const archived =
    coupons?.filter((coupon) => coupon.status !== "ISSUED") ?? [];
  const shouldTrackRead = Boolean(
    issued.length > 0 &&
      (couponReadState == null ||
        (!couponReadState.read && couponReadState.unreadAvailableCount > 0)),
  );
  const handleCouponReadMarked = useCallback((state: CouponAgendaReadState) => {
    setCouponReadState(state);
    cacheDashboardCouponAgendaRead(state);
  }, []);
  const couponReadRef = useCouponReadVisibility<HTMLDivElement>({
    enabled: shouldTrackRead,
    onMarkedRead: handleCouponReadMarked,
  });

  if (loading) {
    return (
      <div className={dcx("app-page-shell v2-page-shell coupons-page")}>
        <div className={dcx("me-state")}>
          <span className={dcx("me-state-spinner")} />
          <span>加载中……</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={dcx("app-page-shell v2-page-shell coupons-page")}>
        <div className={dcx("me-state is-error")}>{error}</div>
      </div>
    );
  }

  return (
    <div className={dcx("app-page-shell v2-page-shell coupons-page")}>
      <header className={dcx("v2-page-header coupons-header")}>
        <span className={dcx("v2-page-header-eyebrow")}>
          <ClipboardIcon className={dcx("coupons-header-icon")} />
          商家优惠
        </span>
        <h1>我的优惠券</h1>
        <p>向商家出示核销码即可使用</p>
      </header>

      <div ref={couponReadRef} className={dcx("coupons-main")}>
        <CouponsPanel
          title="可用优惠券"
          description="到店消费时，向商家出示下方核销码即可抵扣"
          count={issued.length}
        >
          {issued.length === 0 ? (
            <CouponsEmptyState />
          ) : (
            <div className={dcx("coupons-list")}>
              {issued.map((coupon) => (
                <CouponCard
                  key={coupon.id}
                  coupon={coupon}
                  onShowCode={() => setSelectedCoupon(coupon)}
                />
              ))}
            </div>
          )}
        </CouponsPanel>

        {archived.length > 0 ? (
          <CouponsPanel
            title="历史记录"
            description="已使用或过期的优惠券"
            count={archived.length}
            muted
          >
            <div className={dcx("coupons-list")}>
              {archived.map((coupon) => (
                <CouponCard key={coupon.id} coupon={coupon} archived />
              ))}
            </div>
          </CouponsPanel>
        ) : null}
      </div>

      <CouponCodeDialog
        coupon={selectedCoupon}
        onClose={() => setSelectedCoupon(null)}
      />
    </div>
  );
}
