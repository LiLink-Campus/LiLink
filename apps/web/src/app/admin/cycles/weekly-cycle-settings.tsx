"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchApi } from "@/lib/api";
import styles from "./cycles.module.css";

type Settings = { enabled: boolean; deadlineHours: number };

export function WeeklyCycleSettings({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchApi<Settings>("/admin/weekly-cycle-settings")
      .then((value) => { if (active) setSettings(value); })
      .catch(() => { if (active) setError("自动轮次设置加载失败，请刷新页面重试。"); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await fetchApi<Settings & { createdCycle: { codename: string } | null }>("/admin/weekly-cycle-settings", {
        method: "PUT", body: JSON.stringify(settings),
      });
      setSettings({ enabled: saved.enabled, deadlineHours: saved.deadlineHours });
      setMessage(saved.enabled
        ? `自动续轮已开启。${saved.createdCycle ? `${saved.createdCycle.codename}已创建并开放报名。` : "当前轮次揭晓后将自动创建下一轮。"}`
        : "自动续轮已暂停，已有轮次仍按原计划进行。");
      onSaved();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "自动轮次设置保存失败。");
    } finally { setPending(false); }
  }

  return (
    <section className={styles.panel} aria-labelledby="weekly-cycle-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="weekly-cycle-title">每周自动续轮</h2>
          <p>每周二 21:00（北京时间）揭晓，名称按“第 xx 周”连续编号。当前轮次揭晓后，下一轮自动开放报名。</p>
        </div>
      </div>
      {settings && <form onSubmit={(event) => void save(event)} className={styles.automationForm}>
        <label><input type="checkbox" checked={settings.enabled} disabled={pending}
          onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />启用自动续轮</label>
        <label>报名截止
          <select value={settings.deadlineHours} disabled={pending}
            onChange={(event) => setSettings({ ...settings, deadlineHours: Number(event.target.value) })}>
            <option value={2}>周二 19:00</option>
            <option value={1}>周二 20:00</option>
            <option value={24}>周一 21:00</option>
          </select>
        </label>
        <button className="ui-button ui-button--secondary" type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存自动轮次设置"}
        </button>
      </form>}
      {!settings && !error && <p role="status">正在加载设置…</p>}
      <p className={styles.automationNote}>启用时若没有进行中的轮次，将立即创建下一轮。截止时间调整仅影响之后新建的轮次。</p>
      {error && <p role="alert" className="ui-form-message ui-form-message--error">{error}</p>}
      {message && <p role="status" className="ui-form-message ui-form-message--success">{message}</p>}
    </section>
  );
}
