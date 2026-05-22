"use client";

import { useEffect, useState } from "react";
import {
  fetchMyReferral,
  recordShareEvent,
  type MyReferralOverview,
} from "../../../lib/api";

const CHANNEL_LABELS: Record<string, string> = {
  WECHAT_MOMENTS: "微信朋友圈",
  WECHAT_GROUP: "微信群",
  WECHAT_PRIVATE: "微信私聊",
  COPY_LINK: "复制链接",
  QR: "二维码",
  OTHER: "其他",
};

export function ReferralsClient() {
  const [data, setData] = useState<MyReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  async function shareLink(channel: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(channel);
      setTimeout(() => setCopied((current) => (current === channel ? null : current)), 2000);
    } catch {
      // Clipboard may be unavailable; the share is still recorded below.
    }
    void recordShareEvent(channel).catch(() => undefined);
  }

  if (loading) {
    return (
      <main className="app-page-shell v2-page-shell">
        <p style={{ padding: "2rem" }}>加载中……</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="app-page-shell v2-page-shell">
        <p style={{ padding: "2rem" }}>{error}</p>
      </main>
    );
  }
  if (!data) return null;

  return (
    <main className="app-page-shell v2-page-shell">
      <header className="me-hero">
        <h1 className="me-hero-name">我的邀请</h1>
        <p className="me-hero-email">分享专属链接，邀请同学加入 LiLink</p>
      </header>

      <section className="me-group">
        <div className="me-card-preview">
          <div className="me-card-preview-header">
            <h3>我的邀请码</h3>
            <p>{data.referralCode ?? "尚未生成"}</p>
          </div>
        </div>
      </section>

      <section className="me-group">
        <div className="me-card-preview-header">
          <h3>分享渠道</h3>
          <p>点击复制带渠道标记的专属链接</p>
        </div>
        {data.links.map((link) => (
          <div key={link.channel} className="me-card-field">
            <span className="me-card-label">
              {CHANNEL_LABELS[link.channel] ?? link.channel}
            </span>
            <button
              type="button"
              className="me-card-value"
              onClick={() => void shareLink(link.channel, link.url)}
            >
              {copied === link.channel ? "已复制" : "复制链接"}
            </button>
          </div>
        ))}
      </section>

      <section className="me-group">
        <div className="me-card-preview-header">
          <h3>我的邀请漏斗</h3>
        </div>
        <div className="me-card-field">
          <span className="me-card-label">已邀请注册</span>
          <span className="me-card-value">{data.funnel.invited}</span>
        </div>
        <div className="me-card-field">
          <span className="me-card-label">已激活</span>
          <span className="me-card-value">{data.funnel.activated}</span>
        </div>
        <div className="me-card-field">
          <span className="me-card-label">已领券</span>
          <span className="me-card-value">{data.funnel.granted}</span>
        </div>
        <div className="me-card-field">
          <span className="me-card-label">已核销</span>
          <span className="me-card-value">{data.funnel.redeemed}</span>
        </div>
      </section>
    </main>
  );
}
