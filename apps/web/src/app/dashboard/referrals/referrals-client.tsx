"use client";

import { CHANNEL_META } from "@lilink/shared";
import { dcx } from "../_lib/dashboard-class-names";
import { useEffect, useState } from "react";
import { useToast } from "../_components/ToastProvider";
import {
  CheckCircleIcon,
  CopyIcon,
  PeopleIcon,
  ShareIcon,
  SparklesIcon,
} from "../_components/icons";
import {
  fetchMyReferral,
  recordShareEvent,
  type MyReferralOverview,
} from "../../../lib/api";
import { ReferralShareSheet } from "./ReferralShareSheet";

const INVITE_PROGRESS: {
  key: "invited" | "activated";
  label: string;
  description: string;
}[] = [
  {
    key: "invited",
    label: "已注册加入",
    description: "通过你的链接创建了账号",
  },
  {
    key: "activated",
    label: "资料已完善",
    description: "填好问卷并报名匹配周期",
  },
];

export function ReferralsClient() {
  const [data, setData] = useState<MyReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    fetchMyReferral()
      .then((result) => {
        if (active) setData(result);
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
  }, []);

  async function copyReferralCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      showToast("邀请码已复制");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast("复制失败，请手动选择复制");
    }
  }

  async function handleShare(
    channel:
      | "WECHAT_MOMENTS"
      | "WECHAT_GROUP"
      | "WECHAT_PRIVATE"
      | "COPY_LINK"
      | "QR"
      | "OTHER",
    url: string,
  ) {
    try {
      await navigator.clipboard.writeText(url);
      // Use shared guide text so toast and share-sheet stay in sync.
      showToast(CHANNEL_META[channel]?.guide ?? "分享链接已复制");
      void recordShareEvent(channel).catch(() => undefined);
      return true;
    } catch {
      showToast("复制失败，请手动选择复制");
      return false;
    }
  }

  if (loading) {
    return (
      <div className={dcx("app-page-shell v2-page-shell referrals-page")}>
        <div className={dcx("me-state")}>
          <span className={dcx("me-state-spinner")} />
          <span>加载中……</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={dcx("app-page-shell v2-page-shell referrals-page")}>
        <div className={dcx("me-state is-error")}>{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const funnelTotal = data.funnel.invited;
  const canShare = data.links.length > 0;

  return (
    <div className={dcx("app-page-shell v2-page-shell referrals-page")}>
      <header className={dcx("v2-page-header referrals-header")}>
        <span className={dcx("v2-page-header-eyebrow")}>
          <SparklesIcon className={dcx("referrals-header-icon")} />
          邀请有礼
        </span>
        <h1>我的邀请</h1>
        <p>分享专属链接，邀请同学加入 LiLink，一起解锁校园社交</p>
      </header>

      <section className={dcx("referrals-invite-card")} aria-label="我的邀请码">
        <span className={dcx("referrals-invite-label")}>我的邀请码</span>
        <div className={dcx("referrals-code-row")}>
          <code className={dcx("referrals-code")}>
            {data.referralCode ?? "尚未生成"}
          </code>
          {data.referralCode && (
            <button
              type="button"
              className={dcx(`referrals-icon-btn${
                copiedCode ? " is-copied" : ""
              }`)}
              aria-label="复制邀请码"
              onClick={() => void copyReferralCode(data.referralCode!)}
            >
              {copiedCode ? <CheckCircleIcon /> : <CopyIcon />}
            </button>
          )}
        </div>
        <p className={dcx("referrals-invite-hint")}>
          点击下方按钮，选择微信或其他 App 分享给你的同学。
        </p>
        <button
          type="button"
          className={dcx("referrals-share-cta")}
          disabled={!canShare}
          onClick={() => setShareSheetOpen(true)}
        >
          <ShareIcon />
          邀请同学
        </button>
      </section>

      <ReferralShareSheet
        open={shareSheetOpen}
        links={data.links}
        onClose={() => setShareSheetOpen(false)}
        onShare={handleShare}
      />

      <section
        className={dcx("referrals-panel")}
        aria-labelledby="referrals-progress-title"
      >
        <div className={dcx("referrals-panel-head")}>
          <h2 id="referrals-progress-title">我邀请的同学</h2>
          <p>
            {funnelTotal > 0
              ? `已有 ${funnelTotal} 位同学通过你的链接注册`
              : "分享链接给同学，他们注册后会显示在这里"}
          </p>
        </div>
        <div className={dcx("referrals-progress-stats")}>
          {INVITE_PROGRESS.map((step, index) => {
            const value = data.funnel[step.key];
            const Icon = index === 0 ? PeopleIcon : CheckCircleIcon;

            return (
              <div key={step.key} className={dcx("referrals-progress-stat")}>
                <div className={dcx("referrals-progress-stat-inner")}>
                  <div className={dcx("referrals-progress-icon-wrapper")}>
                    <Icon className={dcx("referrals-progress-icon")} aria-hidden="true" />
                  </div>
                  <p className={dcx("referrals-progress-heading")}>
                    <strong className={dcx("referrals-progress-value")}>{value}</strong>
                    <span className={dcx("referrals-progress-label")}>{step.label}</span>
                  </p>
                  <span className={dcx("referrals-progress-desc")}>
                    {step.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
