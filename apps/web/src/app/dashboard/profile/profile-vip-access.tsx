import type { RefObject } from "react";
import Link from "next/link";
import styles from "./profile-redesign.module.css";

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
