"use client";

export function ProfileReadPending({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return <section className="ui-card ui-card--padded" aria-label="同步最新资料">
    {error ? <><p role="alert">{error}</p><button className="ui-button ui-button--secondary" type="button" onClick={onRetry}>重试加载最新资料</button></> : <p role="status">正在同步最新资料…</p>}
  </section>;
}
