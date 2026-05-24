"use client";

import { CHANNEL_META, type ReferralChannel } from "@lilink/shared";
import { dcx } from "../_lib/dashboard-class-names";
import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  CopyIcon,
  LinkIcon,
  MessageCircleIcon,
  PeopleIcon,
  QrCodeIcon,
  ShareIcon,
} from "../_components/icons";
import { recordShareEvent } from "../../../lib/api";

// ReferralChannel re-exported as ShareChannel for local clarity.
type ShareChannel = ReferralChannel;

type ChannelLink = {
  channel: string;
  url: string;
};

const SHARE_CHANNEL_ORDER: ShareChannel[] = [
  "WECHAT_PRIVATE",
  "WECHAT_GROUP",
  "WECHAT_MOMENTS",
  "COPY_LINK",
  "QR",
  "OTHER",
];

// Icon map kept local — shared CHANNEL_META intentionally omits React icon refs.
const CHANNEL_ICONS: Record<ShareChannel, typeof LinkIcon> = {
  WECHAT_PRIVATE: MessageCircleIcon,
  WECHAT_GROUP: PeopleIcon,
  WECHAT_MOMENTS: ShareIcon,
  COPY_LINK: LinkIcon,
  QR: QrCodeIcon,
  OTHER: LinkIcon,
};

function tryOpenWeChat() {
  if (typeof window === "undefined") return;
  if (/MicroMessenger/i.test(navigator.userAgent)) return;
  if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
  window.location.href = "weixin://";
}

type ReferralShareSheetProps = {
  open: boolean;
  links: ChannelLink[];
  onClose: () => void;
  onShare: (channel: ShareChannel, url: string) => Promise<boolean>;
};

export function ReferralShareSheet({
  open,
  links,
  onClose,
  onShare,
}: ReferralShareSheetProps) {
  const [activeChannel, setActiveChannel] = useState<ShareChannel | null>(null);
  const [copiedChannel, setCopiedChannel] = useState<ShareChannel | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open) {
      setActiveChannel(null);
      setCopiedChannel(null);
      setSharing(false);
      return;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !sharing) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, sharing, onClose]);

  if (!open) return null;

  const linkByChannel = new Map(links.map((link) => [link.channel, link.url]));
  const qrUrl = linkByChannel.get("QR") ?? links[0]?.url ?? null;

  async function handleChoose(channel: ShareChannel) {
    if (sharing) return;

    if (channel === "QR") {
      setActiveChannel("QR");
      setCopiedChannel(null);
      void recordShareEvent(channel).catch(() => undefined);
      return;
    }

    const url = linkByChannel.get(channel);
    if (!url) return;

    setSharing(true);
    const copied = await onShare(channel, url);
    setSharing(false);
    if (!copied) return;

    setCopiedChannel(channel);
    setActiveChannel(null);
    if (CHANNEL_META[channel].opensWeChat) {
      window.setTimeout(tryOpenWeChat, 350);
    }
    window.setTimeout(onClose, 900);
  }

  return (
    <div className={dcx("intent-sheet-root")} role="presentation">
      <button
        type="button"
        className={dcx("intent-sheet-backdrop")}
        aria-label="关闭分享选择"
        disabled={sharing}
        onClick={onClose}
      />
      <div
        className={dcx("intent-sheet referrals-share-sheet")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="referrals-share-sheet-title"
      >
        <div className={dcx("intent-sheet-handle")} aria-hidden="true" />
        <p className={dcx("eyebrow")}>分享邀请</p>
        <h2 id="referrals-share-sheet-title">选择分享方式</h2>
        <p className={dcx("app-muted")}>
          选好渠道后会自动复制专属链接，再粘贴到对应 App 即可。
        </p>
        <ul className={dcx("intent-sheet-options")}>
          {SHARE_CHANNEL_ORDER.map((channel) => {
            const meta = CHANNEL_META[channel];
            const Icon = CHANNEL_ICONS[channel];
            const available = channel === "QR" ? Boolean(qrUrl) : linkByChannel.has(channel);
            if (!available) return null;

            const isCopied = copiedChannel === channel;
            const isActive = activeChannel === channel;

            return (
              <li key={channel}>
                <button
                  type="button"
                  className={
                    isActive || isCopied
                      ? dcx("intent-sheet-option is-active")
                      : dcx("intent-sheet-option")
                  }
                  disabled={sharing}
                  onClick={() => void handleChoose(channel)}
                >
                  <span className={dcx("intent-sheet-option-glyph")} aria-hidden="true">
                    <Icon />
                  </span>
                  <span className={dcx("intent-sheet-option-text")}>
                    <span className={dcx("intent-sheet-option-primary")}>{meta.label}</span>
                    <span className={dcx("intent-sheet-option-subtitle")}>
                      {isCopied ? meta.guide : meta.hint}
                    </span>
                  </span>
                  <span className={dcx("referrals-share-sheet-action")} aria-hidden="true">
                    {isCopied ? <CheckCircleIcon /> : channel === "QR" ? <QrCodeIcon /> : <CopyIcon />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {activeChannel === "QR" && qrUrl ? (
          <div className={dcx("referrals-share-qr-panel")}>
            <div className={dcx("referrals-qr-frame")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                alt="邀请二维码"
                width={180}
                height={180}
              />
            </div>
            <p className={dcx("referrals-share-qr-guide")}>{CHANNEL_META.QR.guide}</p>
          </div>
        ) : null}

        <button
          type="button"
          className={dcx("ui-button ui-button--secondary intent-sheet-cancel")}
          disabled={sharing}
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </div>
  );
}
