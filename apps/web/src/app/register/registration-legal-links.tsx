"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { TermsDocument } from "../_components/legal/terms-document";
import { PrivacyDocument } from "../_components/legal/privacy-document";
import styles from "./registration-legal-links.module.css";

type DocumentKind = "terms" | "privacy";
const historyKey = "lilinkRegistrationLegal";

export function RegistrationLegalLinks() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<DocumentKind | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function onPopState() {
      const entry = window.history.state?.[historyKey];
      setKind(entry?.id === id && (entry.kind === "terms" || entry.kind === "privacy") ? entry.kind : null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [id]);

  useEffect(() => {
    if (kind) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.current?.showModal();
      dialog.current?.querySelector("[data-legal-content]")?.scrollTo(0, 0);
      return () => { document.body.style.overflow = previousOverflow; };
    } else {
      dialog.current?.close();
    }
  }, [kind]);

  function open(event: MouseEvent<HTMLAnchorElement>, next: DocumentKind) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    window.history.pushState(
      { ...window.history.state, [historyKey]: { id, kind: next } },
      "",
      window.location.href,
    );
    setKind(next);
  }

  function close() {
    if (window.history.state?.[historyKey]?.id === id) window.history.back();
    else setKind(null);
  }

  return <>
    <a href="/terms" onClick={(event) => open(event, "terms")}>用户协议</a> 和{" "}
    <a href="/privacy" onClick={(event) => open(event, "privacy")}>隐私政策</a>
    {mounted ? createPortal(
      <dialog ref={dialog} className={styles.dialog} aria-label={kind === "privacy" ? "隐私政策" : "用户协议"}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <strong>{kind === "privacy" ? "隐私政策" : "用户协议"}</strong>
          <button type="button" onClick={close} aria-label="关闭弹窗"><span aria-hidden="true">×</span></button>
        </header>
        <div className={styles.content} data-legal-content>
          {kind === "terms" ? <TermsDocument /> : kind === "privacy" ? <PrivacyDocument /> : null}
        </div>
      </dialog>, document.body,
    ) : null}
  </>;
}
