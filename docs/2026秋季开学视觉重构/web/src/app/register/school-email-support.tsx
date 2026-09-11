"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { findMatchingSchool, type EligibleSchoolsPayload } from "../../lib/eligible-schools";
import styles from "./school-email-support.module.css";

export function SchoolEmailSupport({ email, payload }: { email: string; payload: EligibleSchoolsPayload }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [query, setQuery] = useState("");
  const match = findMatchingSchool(payload.schools, email);
  const completeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const search = query.trim().toLowerCase();
  const schools = payload.schools.filter(school => !search || school.name.toLowerCase().includes(search) || school.domains.some(domain => domain.toLowerCase().includes(search)));

  return <div className={styles.support}>
    <div className={styles.summary}>
      {match ? <p role="status" className={styles.matched}>✓ {match.school.name}</p> : email.trim().startsWith("@") ? <p role="status">请补全 @ 前的邮箱账号</p> : completeEmail ? <p role="status">暂不支持此邮箱后缀</p> : null}
      <button className={styles.open} type="button" onClick={() => { setQuery(""); dialog.current?.showModal(); }}>查看支持的学校 <span aria-hidden="true">›</span></button>
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={headingId} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); if (event.key === "Escape") { event.preventDefault(); dialog.current?.close(); } }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.sheet}>
        <header><h2 id={headingId}>支持的学校</h2><button type="button" aria-label="关闭学校列表" onClick={() => dialog.current?.close()}>×</button></header>
        <input type="search" aria-label="搜索学校或邮箱后缀" placeholder="搜索学校或邮箱后缀" value={query} onChange={event => setQuery(event.target.value)} />
        <ul>{schools.map(school => <li key={school.id}>
          <h3>{school.name}</h3>
          <p>{school.domains.map(domain => <span key={domain}>@{domain}</span>)}</p>
        </li>)}</ul>
        {schools.length === 0 ? <p className={styles.empty} role="status">没有找到相关学校，试试学校简称或邮箱后缀。</p> : null}
        <Link className={styles.more} href="/schools">查看完整学校介绍 ›</Link>
      </div>
    </dialog>
  </div>;
}
