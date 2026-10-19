import { Suspense } from "react";
import { fetchAdminApiServer, hasAdminSessionCookie } from "../../../lib/server-api";
import type { AdminCycle, PaginatedResult } from "../types";
import AdminCyclesClient from "./cycles-client";
import { CYCLE_STATUS_LABELS } from "./cycle-model";
import commonStyles from "../admin-common.module.css";
import { cx } from "../admin-class-names";
import styles from "./cycles.module.css";

async function InitialCycles() {
  if (!(await hasAdminSessionCookie())) return <AdminCyclesClient />;
  let initialRead;
  try {
    const data = await fetchAdminApiServer<PaginatedResult<AdminCycle>>("/admin/cycles?page=1&pageSize=10");
    initialRead = { data, error: null };
  } catch {
    // An attempted SSR read is not silently repeated during hydration.
    initialRead = { data: null, error: "轮次列表暂时无法加载，请点击刷新重试。" };
  }
  return <AdminCyclesClient initialRead={initialRead} />;
}

export default function AdminCyclesPage() {
  return <Suspense fallback={<div className={styles.page}>
    <header className={styles.header}><div><h1>轮次中心</h1><p>看报名进展，预演匹配，核对最终结果。</p></div></header>
    <section className={styles.panel} aria-busy="true">
      <h2>轮次管理</h2>
      <div className={cx([commonStyles], "admin-search-bar")}><input disabled placeholder="搜索轮次名称或备注" aria-label="搜索轮次" /></div>
      <div className={cx([commonStyles], "admin-tabs")}>
        {Object.entries(CYCLE_STATUS_LABELS).map(([status, label]) => <button key={status} type="button" className="ui-segmented-item" disabled>{label}</button>)}
      </div>
      <p role="status">正在加载轮次列表…</p>
    </section>
  </div>}><InitialCycles /></Suspense>;
}
