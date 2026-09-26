"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { findMatchingSchool, type EligibleSchoolsPayload } from "../../lib/eligible-schools";
import styles from "./school-email-support.module.css";

export function SchoolEmailSupport({
  email,
  payload,
  pending,
  error,
  onRefresh,
}: {
  email: string;
  payload: EligibleSchoolsPayload | null;
  pending: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [query, setQuery] = useState("");
  const match = payload ? findMatchingSchool(payload.schools, email) : null;
  const completeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const search = query.trim().toLowerCase();
  const schools = (payload?.schools ?? []).filter(
    (school) =>
      !search ||
      school.name.toLowerCase().includes(search) ||
      school.domains.some((domain) => domain.toLowerCase().includes(search))
  );

  function openSchools() {
    setQuery("");
    dialog.current?.showModal();
    onRefresh();
  }

  return (
    <div className={styles.support}>
      <div className={styles.summary}>
        {email.trim().startsWith("@") ? (
          <p role="status">请补全 @ 前的邮箱账号</p>
        ) : pending ? (
          <p role="status">学校列表加载中…</p>
        ) : error && !payload ? (
          <p role="status">暂时无法核对邮箱后缀</p>
        ) : match ? (
          <p role="status" className={styles.matched}>
            ✓ {match.school.name}
          </p>
        ) : completeEmail && payload ? (
          <p role="status">暂不支持此邮箱后缀</p>
        ) : null}
        <button className={styles.open} type="button" onClick={openSchools}>
          查看支持的学校 <span aria-hidden="true">›</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={headingId}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            dialog.current?.close();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className={styles.sheet}>
          <header>
            <h2 id={headingId}>支持的学校</h2>
            <button type="button" aria-label="关闭学校列表" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </header>
          <input
            type="search"
            aria-label="搜索学校或邮箱后缀"
            placeholder="搜索学校或邮箱后缀"
            value={query}
            disabled={!payload}
            onChange={(event) => setQuery(event.target.value)}
          />
          {error && payload ? (
            <div role="alert">
              <p>{error} 当前保留上次学校列表。</p>
              <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>重试加载学校列表</Button>
            </div>
          ) : null}
          {pending ? (
            <p className={styles.empty} role="status">
              正在加载最新学校列表…
            </p>
          ) : error && !payload ? (
            <div className={styles.empty}>
              <p role="alert">{error}</p>
              <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
                重试加载学校列表
              </Button>
            </div>
          ) : payload?.schools.length === 0 ? (
            <div className={styles.empty}>
              <p role="status">目前暂无支持学校邮箱注册的学校，请稍后再试。</p>
              <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
                重新加载学校列表
              </Button>
            </div>
          ) : schools.length === 0 ? (
            <p className={styles.empty} role="status">
              没有找到相关学校，试试学校名称或邮箱后缀。
            </p>
          ) : (
            <ul>
              {schools.map((school) => (
                <li key={school.id}>
                  <h3>{school.name}</h3>
                  <p>
                    {school.domains.map((domain) => (
                      <span key={domain}>@{domain}</span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link className={styles.more} href="/schools">
            查看完整学校介绍 ›
          </Link>
        </div>
      </dialog>
    </div>
  );
}
