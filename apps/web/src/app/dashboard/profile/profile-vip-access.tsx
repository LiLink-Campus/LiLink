import { useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import type { VipStatus } from "../vip/vip-client";
import styles from "./profile-redesign.module.css";

export function useProfileVipAccess(initialVip: VipStatus | null) {
  const [vip, setVip] = useState(initialVip);
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void fetchApi<VipStatus>("/me/vip")
        .then((next) => {
          if (!disposed) setVip(next);
        })
        .catch(() => {
          if (!disposed) setVip(null);
        });
    };
    const expire = vip?.expiresAt
      ? window.setTimeout(
          () => {
            if (Date.parse(vip.expiresAt!) <= Date.now())
              setVip((current) => (current ? { ...current, active: false } : null));
            refresh();
          },
          Math.min(2_147_483_647, Math.max(0, Date.parse(vip.expiresAt) - Date.now()))
        )
      : undefined;
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
      window.clearTimeout(expire);
    };
  }, [vip?.expiresAt]);

  return Boolean(vip?.active);
}

export function ProfileVipDialog({
  vipDialogRef,
}: {
  vipDialogRef: RefObject<HTMLDialogElement | null>;
}) {
  return (
    <dialog
      ref={vipDialogRef}
      className={styles.vipDialog}
      aria-labelledby="vip-unlock-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) vipDialogRef.current?.close();
      }}
    >
      <span className={styles.vipEyebrow}>LiLink VIP</span>
      <h2 id="vip-unlock-title">开通 VIP，设置高级筛选</h2>
      <p>学校、身高、体重和颜值偏好是 VIP 专享功能。开通后，你的筛选条件才会用于匹配。</p>
      <Link href="/dashboard/vip" className={styles.vipDialogCta}>
        查看权益与开通
      </Link>
      <button type="button" onClick={() => vipDialogRef.current?.close()}>
        暂不开通，继续填写
      </button>
    </dialog>
  );
}
