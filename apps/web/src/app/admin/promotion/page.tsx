"use client";

import { useState } from "react";
import { CHANNEL_META, type ReferralChannel } from "@lilink/shared";
import { useAdminRead } from "../use-admin-read";
import styles from "../growth.module.css";

type Acquisition = {
  shares: number;
  visits: number;
  registrations: number;
  invitedRegistrations: number;
  qualified: number;
  channels: {
    channel: string;
    shares: number;
    visits: number;
    registrations: number;
    qualified: number;
  }[];
  referrers: { id: string; name: string; registrations: number; qualified: number }[];
};
function dateInChina(offset = 0) {
  return new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
}
const channelName = (key: string) =>
  key === "DIRECT" ? "未记录渠道" : (CHANNEL_META[key as ReferralChannel]?.label ?? key);

export default function AdminPromotionPage() {
  const [from, setFrom] = useState(() => dateInChina(-29));
  const [to, setTo] = useState(() => dateInChina());
  const [range, setRange] = useState(() => ({ from: dateInChina(-29), to: dateInChina() }));
  const [revision, setRevision] = useState(0);
  const start = new Date(`${range.from}T00:00:00+08:00`);
  const end = new Date(new Date(`${range.to}T00:00:00+08:00`).getTime() + 86400000);
  const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
  const { data, loading, error } = useAdminRead<Acquisition>(`/admin/promotion/acquisition?${params}`, revision);
  function selectDays(days: number) {
    const next = { from: dateInChina(1 - days), to: dateInChina() };
    setFrom(next.from);
    setTo(next.to);
    setRange(next);
  }
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>邀请推广</h1>
          <p className={styles.muted}>持续看邀请来源和注册效果，无需创建商户活动。</p>
        </div>
        <button
          className="ui-button ui-button--secondary"
          disabled={loading}
          onClick={() => setRevision((r) => r + 1)}
        >
          {loading ? "加载中…" : "刷新"}
        </button>
      </header>
      <section className={styles.panel}>
        <div className={styles.header}>
          <h2>统计时间</h2>
          <div className={styles.toolbar}>
            {[7, 30, 90].map((days) => (
              <button
                className="ui-button ui-button--secondary"
                key={days}
                onClick={() => selectDays(days)}
              >
                近 {days} 天
              </button>
            ))}
          </div>
        </div>
        <form
          className={styles.toolbar}
          style={{ marginTop: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) setRange({ from, to });
          }}
        >
          <label>
            开始日期{" "}
            <input
              aria-label="开始日期"
              type="date"
              required
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            结束日期{" "}
            <input
              aria-label="结束日期"
              type="date"
              required
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="ui-button ui-button--primary"
            disabled={!from || !to || from > to || loading}
          >
            查看
          </button>
        </form>
        <p className={styles.muted}>按北京时间统计，最多查询 370 天；排除测试与已注销账号。</p>
      </section>
      {error && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {error}
        </p>
      )}
      {loading && !data ? (
        <p className={styles.empty}>正在加载推广数据…</p>
      ) : (
        data && (
          <>
            <div className={styles.metrics}>
              {[
                ["邀请页访问", data.visits, "按邀请码、访客、天去重"],
                ["新增注册", data.registrations, `其中邀请注册 ${data.invitedRegistrations} 人`],
                ["已完成问卷与首次报名", data.qualified, "所选时间内注册用户的当前进度"],
                ["点击分享", data.shares, "点击分享按钮次数"],
              ].map(([label, value, hint]) => (
                <div className={styles.metric} key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <span>{hint}</span>
                </div>
              ))}
            </div>
            <div className={styles.columns}>
              <section className={styles.panel}>
                <h2>注册来源</h2>
                <p className={styles.muted}>根据注册时记录的渠道，查看人数及完成进度。</p>
                {data.channels.filter((c) => c.registrations > 0).length ? (
                  data.channels
                    .filter((c) => c.registrations > 0)
                    .map((c) => (
                      <div className={styles.row} key={c.channel}>
                        <div className={styles.grow}>
                          <strong>{channelName(c.channel)}</strong>
                          <div className={styles.bar}>
                            <span
                              style={{
                                width: `${data.registrations ? (c.registrations / data.registrations) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <p className={styles.muted}>完成问卷与首次报名 {c.qualified} 人</p>
                        </div>
                        <strong>{c.registrations} 人</strong>
                      </div>
                    ))
                ) : (
                  <p className={styles.empty}>
                    这段时间还没有新增注册。
                    <br />
                    分享个人邀请链接后，可在这里查看效果。
                  </p>
                )}
              </section>
              <section className={styles.panel}>
                <h2>邀请人排行</h2>
                <p className={styles.muted}>按所选时间内带来的注册人数排序，最多显示前 20 位。</p>
                {data.referrers.length ? (
                  data.referrers.map((r, i) => (
                    <div className={styles.row} key={r.id}>
                      <span className={styles.badge}>{i + 1}</span>
                      <div className={styles.grow}>
                        <strong>{r.name}</strong>
                        <p className={styles.muted}>完成问卷与首次报名 {r.qualified} 人</p>
                      </div>
                      <strong>{r.registrations} 人</strong>
                    </div>
                  ))
                ) : (
                  <p className={styles.empty}>暂无邀请注册记录。</p>
                )}
              </section>
            </div>
            <section className={styles.panel}>
              <h2>分享与访问</h2>
              <p className={styles.muted}>
                分享和访问是这段时间发生的行为；注册按创建账号时间统计，两者不直接作为转化率分母。
              </p>
              {data.channels.some((c) => c.shares || c.visits) ? (
                <div className={styles.scroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>渠道</th>
                        <th>点击分享</th>
                        <th>邀请页访问</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.channels
                        .filter((c) => c.shares || c.visits)
                        .map((c) => (
                          <tr key={c.channel}>
                            <td>{channelName(c.channel)}</td>
                            <td>{c.shares}</td>
                            <td>{c.visits}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.empty}>暂无分享或访问记录。</p>
              )}
            </section>
          </>
        )
      )}
    </div>
  );
}
