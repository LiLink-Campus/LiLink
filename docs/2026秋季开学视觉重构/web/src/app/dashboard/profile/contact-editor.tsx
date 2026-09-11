"use client";

import { useEffect, useRef, useState } from "react";
import { fetchApi } from "../../../lib/api";
import type { ContactPreferencesPayload } from "../_lib/types";
import styles from "./profile-redesign.module.css";

const channels = [{ value: "EMAIL", label: "邮箱" }, { value: "WECHAT", label: "微信" }, { value: "QQ", label: "QQ" }, { value: "PHONE", label: "电话" }] as const;
export type ContactSaveStatus = "saved" | "pending" | "saving" | "invalid" | "error";

export function ContactEditor({ initial, email, onStatus }: { initial: ContactPreferencesPayload; email: string; onStatus: (status: ContactSaveStatus) => void }) {
  const [channel, setChannel] = useState(initial.preferredContactChannel);
  const [methods, setMethods] = useState(initial.methods);
  const [status, setStatus] = useState<ContactSaveStatus>("saved");
  const [retry, setRetry] = useState(0);
  const value = channel === "EMAIL" ? email : methods.find((method) => method.type === channel)?.value ?? "";
  const payload = JSON.stringify({ preferredContactChannel: channel, methods: methods.filter((method) => method.value.trim()).map((method) => ({ ...method, value: method.value.trim() })) });
  const saved = useRef(payload);
  const latest = useRef(payload);
  const queue = useRef(Promise.resolve());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onStatus(status); }, [onStatus, status]);
  useEffect(() => {
    latest.current = payload;
    if (!value.trim()) return;
    const timer = window.setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (!mounted.current || latest.current !== payload) return;
        if (saved.current === payload) { setStatus("saved"); return; }
        setStatus("saving");
        try {
          await fetchApi("/me/contact-preferences", { method: "PUT", body: payload });
          saved.current = payload;
          if (mounted.current && latest.current === payload) setStatus("saved");
        } catch {
          if (mounted.current && latest.current === payload) setStatus("error");
        }
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [payload, value, retry]);
  function changed(valid: boolean) { setStatus(valid ? "pending" : "invalid"); onStatus(valid ? "pending" : "invalid"); }
  return <section className={styles.contactSection} aria-label="联系方式">
    <div className={styles.sectionHeading}><h2>联系方式</h2></div>
    <div className={styles.contactOptions}>
      <div className={styles.contactRadios} role="radiogroup" aria-label="向对方展示的联系方式">
        {channels.map((item) => <label className={styles.contactChoice} key={item.value}>
          <input aria-label={item.label} type="radio" name="preferredContact" checked={channel === item.value} onChange={() => {
            setChannel(item.value);
            changed(item.value === "EMAIL" || Boolean(methods.find((method) => method.type === item.value)?.value.trim()));
          }} /><span>{item.label}</span>
        </label>)}
      </div>
      <input className={styles.contactValue} aria-label={`${channels.find((item) => item.value === channel)?.label}内容`} type={channel === "PHONE" ? "tel" : "text"} value={value} readOnly={channel === "EMAIL"} placeholder={channel === "EMAIL" ? "注册邮箱" : channel === "WECHAT" ? "填写微信号" : channel === "QQ" ? "填写 QQ 号" : "填写电话号码"} onChange={(event) => {
        if (channel === "EMAIL") return;
        setMethods((current) => [...current.filter((method) => method.type !== channel), { type: channel, value: event.target.value }]);
        changed(Boolean(event.target.value.trim()));
      }} />
      <p role="status">{status === "invalid" ? "请填写选中的联系方式，填写后自动保存。" : status === "error" ? "联系方式保存失败，请重试。" : status === "saving" ? "联系方式正在保存…" : status === "pending" ? "联系方式待保存…" : "已自动保存 · 双方交换后展示"}</p>
      {status === "error" ? <button type="button" className="ui-button ui-button--secondary" onClick={() => { changed(true); setRetry((n) => n + 1); }}>重试保存</button> : null}
    </div>
  </section>;
}
