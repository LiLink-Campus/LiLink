"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../admin-context";
import { fetchApi } from "../../../lib/api";
import { AdminIcon } from "../admin-icon";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./page.module.css";

type Lead = { id: string; phone: string; contacted: boolean; createdAt: string };

export default function MatchLeadsPage() {
  const { authenticated } = useAdmin();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    try {
      setLeads(await fetchApi<Lead[]>("/admin/match-leads"));
      setError("");
    } catch {
      setError("加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, [authenticated]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggleContacted(lead: Lead) {
    setBusy(lead.id);
    try {
      await fetchApi(`/admin/match-leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ contacted: !lead.contacted }),
      });
      await load();
    } catch {
      setError("更新失败，请重试。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={cx(commonStyles, "qb-container")}>
      <header className={cx(commonStyles, "qb-header")}>
        <div>
          <h1>人工匹配登记</h1>
          <p className={cx(commonStyles, "qb-header-desc")}>
            查看意向登记，跟进咨询。待联系记录优先显示。
          </p>
        </div>
        <button
          type="button"
          className="ui-button ui-button--secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          <AdminIcon name="refresh" width="15" height="15" />
          刷新
        </button>
      </header>
      {error && (
        <p className="ui-form-message ui-form-message--error" role="alert">
          {error}
        </p>
      )}
      <div className={styles.panel}>
        <div className={styles.summary}>
          <h2>登记列表</h2>
          <span>
            共 {leads.length} 条<span className={styles.separator}>/</span>待联系{" "}
            {leads.filter((lead) => !lead.contacted).length} 条
          </span>
        </div>
        {loading ? (
          <div className={cx(commonStyles, "admin-empty-state")}>加载中…</div>
        ) : !leads.length ? (
          <div className={styles.empty}>
            <AdminIcon name="leads" width="28" height="28" />
            <strong>暂无登记</strong>
            <p>新的人工匹配意向登记会显示在这里。</p>
          </div>
        ) : (
          <div className={cx(commonStyles, "admin-table-wrap")}>
            <table className={cx(commonStyles, "admin-table")}>
              <thead>
                <tr>
                  <th>手机号</th>
                  <th>登记时间</th>
                  <th>联系状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <a className={styles.phone} href={`tel:${lead.phone}`}>
                        {lead.phone}
                      </a>
                    </td>
                    <td>{new Date(lead.createdAt).toLocaleString("zh-CN")}</td>
                    <td>
                      <span className={styles.badge} data-contacted={lead.contacted}>
                        {lead.contacted ? "已联系" : "待联系"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ui-button ui-button--secondary"
                        disabled={busy !== null}
                        onClick={() => void toggleContacted(lead)}
                      >
                        {busy === lead.id
                          ? "更新中…"
                          : lead.contacted
                            ? "标为待联系"
                            : "标为已联系"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
