import { educationIdentityLabel, UNVERIFIED_EDUCATION_NOTICE } from "@lilink/shared";
import styles from "./member-identity.module.css";

type IdentityProps = { vipActive?: boolean; educationVerified?: boolean; label?: string };

export function MemberIdentity({ vipActive, educationVerified, label = "对方身份" }: IdentityProps) {
  if (vipActive === undefined && educationVerified === undefined) return <span className={styles.unknown}>该轮未记录身份信息</span>;
  return <span className={styles.badges} aria-label={label}>
    {vipActive && <span className={styles.vipBadge} aria-label="VIP 会员">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m3 7 5 4 4-7 4 7 5-4-2 11H5L3 7Z"/><path d="M6 21h12"/></svg>
      VIP<span className={styles.sparkle} aria-hidden="true">✦</span>
    </span>}
    {educationVerified !== undefined && <span className={styles.educationBadge} data-verified={educationVerified}>
      {educationVerified ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m3 8 9-5 9 5-9 5-9-5Zm4 3v6c3 3 7 3 10 0v-6m4-3v9"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>}
      {educationIdentityLabel(educationVerified)}
    </span>}
  </span>;
}

export function MemberEducationNotice({ educationVerified }: { educationVerified?: boolean }) {
  return educationVerified === false ? <p className={styles.notice}>{UNVERIFIED_EDUCATION_NOTICE}</p> : null;
}
