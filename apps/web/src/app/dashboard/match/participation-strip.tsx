"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { WEEKLY_INTENT_LABELS, type WeeklyIntent } from "../../../lib/weekly-intent";
import { IntentSheet } from "../_components/IntentSheet";
import { canEditCurrentCycleParticipation } from "../_lib/format";
import type { DashboardCurrentCycle } from "../_lib/types";
import css from "./match-desktop.module.css";

export function ParticipationStrip({ cycle, submitted, nowMs, onRefresh }: {
  cycle: DashboardCurrentCycle | null;
  submitted: boolean;
  nowMs: number;
  onRefresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState<{ cycleId: string; intent: WeeklyIntent } | null>(null);
  const pending = useRef(false);
  const editable = canEditCurrentCycleParticipation(cycle, nowMs);
  const intent = confirmed?.cycleId === cycle?.id ? confirmed?.intent : cycle?.intent;
  const optedIn = Boolean(intent && (confirmed?.cycleId === cycle?.id || cycle?.participationStatus === "OPTED_IN"));
  const title = !cycle ? "本轮尚未开放" : optedIn ? "本轮已参与" : !editable ? "本轮报名已截止" : !submitted ? "完善资料后参与本轮" : "本轮尚未参与";

  async function choose(intent: WeeklyIntent) {
    if (!cycle || pending.current) return;
    if (!canEditCurrentCycleParticipation(cycle, Date.now())) {
      setOpen(false); setMessage("本轮报名已截止，请刷新查看最新状态。"); return;
    }
    pending.current = true; setSaving(true); setMessage("");
    try {
      await fetchApi("/me/participation", { method: "PUT", body: JSON.stringify({ optIn: true, intent }) });
      setConfirmed({ cycleId: cycle.id, intent });
      setOpen(false);
      setMessage("已确认参与本轮，上一轮的来信仍可查看。");
      try { await onRefresh(); setConfirmed(null); } catch { setMessage("报名已成功，最新信息刷新失败，请稍后刷新页面。"); }
    } catch (error) {
      setOpen(false);
      setMessage(error instanceof Error ? error.message : "报名失败，请稍后重试。");
    } finally { pending.current = false; setSaving(false); }
  }

  return <>
    <section className={css.participation} data-participating={optedIn} aria-label="本轮参与状态">
      <span className={css.statusDot} aria-hidden="true">{optedIn ? "✓" : "●"}</span>
      <div><strong>{title}</strong><p>{optedIn && intent ? `${WEEKLY_INTENT_LABELS[intent].primary} · 每轮需重新确认参与` : "每轮需重新确认参与，不会自动续报"}</p>{cycle && <small>{cycle.codename}</small>}</div>
      {editable && (submitted || optedIn) ? <button disabled={saving} onClick={() => setOpen(true)}>{saving ? "保存中…" : optedIn ? "调整意向" : "确认参与本轮"}</button> : !submitted ? <Link href="/dashboard/profile">完善资料</Link> : null}
    </section>
    {message && <p role="status" className={css.feedback}>{message}</p>}
    <IntentSheet open={open} saving={saving} currentIntent={intent ?? null} onChoose={intent => void choose(intent)} onClose={() => { if (!saving) setOpen(false); }} />
  </>;
}
