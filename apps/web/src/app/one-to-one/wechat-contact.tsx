"use client";

import { useId, useRef } from "react";
import { SocialQr, socialChannels } from "../_components/SocialQr";
import styles from "./page.module.css";

export function WechatContact({ compact = false }: { compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return <>
    <button type="button" className={compact ? styles.primary : styles.contactButton} onClick={() => dialog.current?.showModal()}>添加微信</button>
    <dialog ref={dialog} className={styles.contactDialog} aria-labelledby={titleId} onClick={(event) => {
      if (event.target === event.currentTarget) dialog.current?.close();
    }}>
      <h2 id={titleId}>添加运营微信</h2>
      <p>扫描或长按保存二维码，联系 LiLink 运营。</p>
      <SocialQr channel={socialChannels[0]} className={styles.contactQr} />
      <p>请认准官方运营微信，勿向私人账号付款。</p>
      <form method="dialog"><button className={styles.primary}>关闭</button></form>
    </dialog>
  </>;
}
