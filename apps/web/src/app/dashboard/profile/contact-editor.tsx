"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { beginProfileWrite } from "../_lib/profile-read-revision";
import { useProfileWriteOwner } from "../_lib/profile-write-owner";
import { fetchApi, isApiRequestError } from "../../../lib/api";
import type { ContactPreferencesPayload } from "../_lib/types";
import { phoneDraftForInput, phoneDraftFromValue, phoneDraftValue, prepareContactSave, type PhoneDraft } from "./contact-save";
import styles from "./profile-redesign.module.css";

const channels = [{ value: "EMAIL", label: "邮箱" }, { value: "WECHAT", label: "微信" }, { value: "QQ", label: "QQ" }, { value: "PHONE", label: "电话" }] as const;
export type ContactSaveStatus = "saved" | "pending" | "saving" | "invalid" | "error";

export function ContactEditor({ initial, userId, email, onStatus, onNavigateBlocked }: { initial: ContactPreferencesPayload; userId: string; email: string; onStatus: (status: ContactSaveStatus) => void; onNavigateBlocked?: () => void }) {
  const writeOwner = useProfileWriteOwner();
  const router = useRouter();
  // Email addresses can be reused after account deletion; user IDs cannot.
  const draftKey = `lilink:contact-draft:v2:${userId}`;
  const [ready, setReady] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  const [channel, setChannel] = useState(initial.preferredContactChannel);
  const [methods, setMethods] = useState(initial.methods);
  const [savedMethods, setSavedMethods] = useState(initial.methods);
  const [phone, setPhone] = useState(() => phoneDraftFromValue(initial.methods.find((method) => method.type === "PHONE")?.value ?? ""));
  const [status, setStatus] = useState<ContactSaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const value = channel === "EMAIL" ? email : methods.find((method) => method.type === channel)?.value ?? "";
  const prepared = prepareContactSave(channel, methods, savedMethods);
  const payload = prepared.payload ? JSON.stringify(prepared.payload) : null;
  const validationError = prepared.error;
  const saved = useRef<string | null>(JSON.stringify(prepareContactSave(initial.preferredContactChannel, initial.methods, initial.methods).payload));
  const revision = useRef(initial.revision);
  const refreshBeforeRetry = useRef(false);
  const blockedSave = useRef<string | null>(null);
  const latest = useRef(payload);
  const queue = useRef(Promise.resolve());
  const lifecycle = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      const draft = raw ? JSON.parse(raw) as ContactPreferencesPayload : null;
      if (draft && channels.some((item) => item.value === draft.preferredContactChannel) &&
          Number.isInteger(draft.revision) && Array.isArray(draft.methods) &&
          draft.methods.every((method) => method && ["WECHAT", "QQ", "PHONE"].includes(method.type) && typeof method.value === "string")) {
        const restored = prepareContactSave(draft.preferredContactChannel, draft.methods, initial.methods);
        if (JSON.stringify(restored.payload) !== saved.current) {
          setChannel(draft.preferredContactChannel);
          setMethods(draft.methods);
          setPhone(phoneDraftFromValue(draft.methods.find((method) => method.type === "PHONE")?.value ?? ""));
          if (draft.revision !== initial.revision) {
            blockedSave.current = "联系方式已在其他页面更新。当前填写内容已保留；点击“重试保存”可用当前内容覆盖。";
          }
        }
      }
    } catch { /* Storage may be disabled. Navigation still waits for saving. */ }
    setReady(true);
  }, [draftKey, initial]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (payload === saved.current && status === "saved") sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify({ preferredContactChannel: channel, methods, revision: revision.current }));
    } catch { /* The navigation guard also protects unsaved changes. */ }
  }, [channel, draftKey, methods, payload, ready, status]);
  useEffect(() => {
    const dirty = payload !== saved.current || status === "error" || status === "saving";
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    const navigate = (event: MouseEvent) => {
      if (!dirty || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      setDestination(url.pathname + url.search + url.hash);
      onNavigateBlocked?.();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigate, true);
    };
  }, [onNavigateBlocked, payload, status]);
  useEffect(() => {
    if (destination && status === "saved" && payload === saved.current) {
      setDestination(null);
      router.push(destination);
    }
  }, [destination, payload, router, status]);
  useEffect(() => {
    lifecycle.current += 1;
    return () => {
      lifecycle.current += 1;
      // Keep the existing write deadline; unmount cannot undo a committed save.
    };
  }, []);
  useEffect(() => { onStatus(status); }, [onStatus, status]);
  useEffect(() => {
    if (!ready) return;
    const currentLifecycle = lifecycle.current;
    latest.current = payload;
    setSaveError(null);
    if (!payload) {
      setStatus("invalid");
      return;
    }
    if (blockedSave.current && !refreshBeforeRetry.current) {
      setStatus("error");
      setSaveError(blockedSave.current);
      return;
    }
    if (payload !== saved.current) setStatus("pending");
    const timer = window.setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (lifecycle.current !== currentLifecycle || latest.current !== payload) return;
        if (blockedSave.current && !refreshBeforeRetry.current) {
          setStatus("error");
          setSaveError(blockedSave.current);
          return;
        }
        if (saved.current === payload) { setStatus("saved"); return; }
        setStatus("saving");
        const controller = new AbortController();
        activeRequest.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 10_000);
        const write = beginProfileWrite(userId, writeOwner);
        try {
          if (refreshBeforeRetry.current) {
            const current = await fetchApi<ContactPreferencesPayload>("/me/contact-preferences", { signal: controller.signal });
            if (controller.signal.aborted || lifecycle.current !== currentLifecycle || latest.current !== payload) return;
            revision.current = current.revision;
            refreshBeforeRetry.current = false;
          }
          const result = await fetchApi<ContactPreferencesPayload>("/me/contact-preferences", {
            method: "PUT",
            body: JSON.stringify({ ...JSON.parse(payload), revision: revision.current }),
            signal: controller.signal,
          });
          write.succeeded();
          if (lifecycle.current !== currentLifecycle) return;
          if (controller.signal.aborted) throw new Error("Contact save timed out.");
          blockedSave.current = null;
          revision.current = result.revision;
          saved.current = payload;
          setSavedMethods(result.methods);
          if (latest.current === payload) setStatus("saved");
        } catch (error) {
          if (lifecycle.current !== currentLifecycle) return;
          const apiError = isApiRequestError(error);
          const message = apiError && error.status === 409
            ? "联系方式已在其他页面更新。当前填写内容已保留；点击“重试保存”可用当前内容覆盖。"
            : controller.signal.aborted
              ? "联系方式保存超时，请重试。"
              : error instanceof Error ? error.message : "联系方式保存失败，请重试。";
          if (blockedSave.current || controller.signal.aborted || !apiError || error.status === 409 || error.status >= 500) {
            saved.current = null;
            blockedSave.current = message;
          }
          if (latest.current === payload) {
            setStatus("error");
            setSaveError(message);
          }
        } finally {
          write.finish();
          window.clearTimeout(timeout);
          if (activeRequest.current === controller) activeRequest.current = null;
        }
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [payload, ready, retry, userId, writeOwner]);

  function changeMethod(type: ContactPreferencesPayload["methods"][number]["type"], next: string) {
    setMethods((current) => [...current.filter((method) => method.type !== type), { type, value: next }]);
  }
  function changePhone(next: PhoneDraft) {
    setPhone(next);
    changeMethod("PHONE", phoneDraftValue(next));
  }

  return <section className={styles.contactSection} aria-label="联系方式">
    <div className={styles.contactHeading}><h2>联系方式</h2><p>任选一种，只需填写一个</p></div>
    <div className={styles.contactOptions}>
      <div className={styles.contactRadios} role="radiogroup" aria-label="向对方展示的联系方式">
        {channels.map((item) => <label className={styles.contactChoice} key={item.value}>
          <input aria-label={item.label} type="radio" name="preferredContact" checked={channel === item.value} onChange={() => setChannel(item.value)} /><span>{item.label}</span>
        </label>)}
      </div>
      {channel === "PHONE" ? <div className={styles.phoneFields}>
        <input className={styles.contactValue} aria-label="电话内容" type="tel" autoComplete="tel-national" inputMode="tel" value={phone.number} maxLength={120} aria-invalid={Boolean(validationError)} aria-describedby="contact-save-message" placeholder="填写电话号码" onChange={(event) => changePhone(phoneDraftForInput(event.target.value, "CN"))} />
      </div> : <input className={styles.contactValue} aria-label={`${channels.find((item) => item.value === channel)?.label}内容`} type="text" value={value} maxLength={120} readOnly={channel === "EMAIL"} placeholder={channel === "EMAIL" ? "注册邮箱" : channel === "WECHAT" ? "填写微信号" : "填写 QQ 号"} aria-describedby="contact-save-message" onChange={(event) => {
        if (channel !== "EMAIL") changeMethod(channel, event.target.value);
      }} />}
      <p id="contact-save-message" role="status">{status === "invalid" ? validationError : status === "error" ? saveError : status === "saving" ? "联系方式正在保存…" : status === "pending" ? "联系方式待保存…" : "已自动保存 · 匹配成功后向对方展示"}</p>
      {destination ? <div className={styles.contactNavigationNotice} role="status"><p>联系方式保存后将继续跳转。请先完成填写或重试保存。</p><button type="button" className="ui-button ui-button--secondary" onClick={() => setDestination(null)}>留在当前页</button></div> : null}
      {status === "error" ? <button type="button" className="ui-button ui-button--secondary" onClick={() => { refreshBeforeRetry.current = true; setStatus("pending"); setRetry((n) => n + 1); }}>重试保存</button> : null}
    </div>
  </section>;
}
