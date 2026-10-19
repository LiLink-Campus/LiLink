"use client";
import { IntentLink as Link } from "../../../components/IntentLink";
import CycleStatistics from "./cycle-statistics";
import { CycleResults } from "./cycle-results";
import { CycleEditor } from "./cycle-editor";
import { useCycles } from "./use-cycles";
import type { InitialCyclesRead } from "./cycle-model";
import { AdminDetailDialog } from "../admin-detail-dialog";
import { AdminPagination } from "../admin-pagination";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./cycles.module.css";
import { formatChinaStandardDateTime } from "@/lib/china-standard-time";
import { STATUS_STYLES, CYCLE_STATUS_LABELS, ADMIN_NEW_CYCLE_SELECTION, createEmptyCycleForm } from "./cycle-model";
const adminStyles = [commonStyles];

export default function AdminCyclesClient({ initialRead }: { initialRead?: InitialCyclesRead }) {
  const model = useCycles(initialRead);
  const { selectedCycleId, setSelectedCycleId, editorOpen, setEditorOpen, deleteTarget, setDeleteTarget, statusFilter, setStatusFilter, setPage, cycleDataRefreshKey, setCycleForm, cycleDetail, detailLoading, pending, actionError, setActionError, actionMessage, setActionMessage, draftSearch, setDraftSearch, data, loading, error, refresh, cycles, selectedCycle, deleteCycle, handleSearchSubmit, refreshSelectedCycleDataViews } = model;
  const auditHref = selectedCycle ? `/admin/audit?${new URLSearchParams({ cycleId: selectedCycle.id, cycleName: selectedCycle.codename })}` : "/admin/audit";
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>轮次中心</h1>
          <p>看报名进展，预演匹配，核对最终结果。</p>
        </div>
        <div className="auth-actions">
          <button
            className="ui-button ui-button--secondary"
            type="button"
            disabled={loading || !!pending}
            onClick={() => {
              void refresh();
              refreshSelectedCycleDataViews();
            }}
          >
            刷新
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {error}
        </p>
      )}
      {actionError && !editorOpen && !deleteTarget && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="ui-form-message ui-form-message--success">
          {actionMessage}
        </p>
      )}


      <AdminDetailDialog open={!!deleteTarget} onClose={() => { if (!pending) setDeleteTarget(null); }} title="删除草稿轮次" headerLabel="轮次管理">
        <h2>删除草稿轮次</h2>
        <p>确认删除“{deleteTarget?.codename}”？将同时删除本轮的 {deleteTarget?.participationCount ?? 0} 条参与记录，删除后不可恢复。用户账号和问卷不受影响。</p>
        {actionError && <p role="alert" className="ui-form-message ui-form-message--error">{actionError}</p>}
        <div className="auth-actions">
          <button className="ui-button ui-button--secondary" type="button" disabled={!!pending} onClick={() => setDeleteTarget(null)}>取消</button>
          <button className="ui-button ui-button--primary" type="button" disabled={!!pending} onClick={() => void deleteCycle()}>{pending === "delete" ? "删除中…" : "确认删除"}</button>
        </div>
      </AdminDetailDialog>

      <section className={styles.panel} aria-labelledby="cycle-management-title">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="cycle-management-title">轮次管理</h2>
            <p>共 {data?.total ?? 0} 个轮次，选择一个查看图表和匹配结果。</p>
          </div>
          <div className="auth-actions">
            <button
              className="ui-button ui-button--primary"
              type="button"
              disabled={!!pending}
              onClick={() => {
                setSelectedCycleId(ADMIN_NEW_CYCLE_SELECTION);
                setCycleForm(createEmptyCycleForm());
                setEditorOpen(true);
                setActionError(null);
                setActionMessage(null);
              }}
            >
              新建轮次
            </button>
            <button
              className="ui-button ui-button--secondary"
              type="button"
              disabled={!selectedCycle || !!pending}
              onClick={() => {
                setEditorOpen(true);
                setActionError(null);
              }}
            >
              编辑轮次
            </button>
            <button className="ui-button ui-button--secondary" type="button"
              disabled={!selectedCycle || selectedCycle.status !== "DRAFT" || !!pending || detailLoading || !cycleDetail || cycleDetail.cycle.id !== selectedCycle.id || cycleDetail.summary.matchedPairCount > 0}
              onClick={() => { if (selectedCycle && cycleDetail) { setActionError(null); setDeleteTarget({ ...selectedCycle, participationCount: cycleDetail.summary.participationCount }); } }}>
              删除草稿
            </button>
          </div>
        </div>
        <p className={styles.scopeNote}>尚未生成匹配结果的草稿可删除，其参与记录会一并删除；进行中和已揭晓轮次保留历史记录。</p>
        <form className={cx(adminStyles, "admin-search-bar")} onSubmit={handleSearchSubmit}>
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="搜索轮次名称或备注"
            aria-label="搜索轮次"
          />
        </form>
        <div className={cx(adminStyles, "admin-tabs")}>
          {(["ALL", "DRAFT", "OPEN", "PREPARING", "REVEAL_READY", "REVEALED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={statusFilter === s ? "ui-segmented-item active" : "ui-segmented-item"}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
            >
              {CYCLE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className={styles.cycleGrid}>
          {cycles.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              className={styles.cycleItem}
              aria-pressed={cycle.id === selectedCycleId}
              disabled={!!pending && pending !== "preview"}
              onClick={() => {
                setSelectedCycleId(cycle.id);
              }}
            >
              <div className={cx(adminStyles, "admin-record-topline")}>
                <strong>{cycle.codename}</strong>
                <span className="ui-badge ui-badge--neutral" style={STATUS_STYLES[cycle.status]}>
                  {CYCLE_STATUS_LABELS[cycle.status]}
                </span>
              </div>
              <p>揭晓：{formatChinaStandardDateTime(cycle.revealAt)}</p>
            </button>
          ))}
          {cycles.length === 0 && (
            <div className={cx(adminStyles, "admin-empty-state")}>{loading ? "正在加载轮次中心…" : "没有找到匹配的轮次。"}</div>
          )}
        </div>
        {data && data.totalPages > 1 && (
          <AdminPagination
            className={cx(adminStyles, "admin-pagination")}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="个轮次"
            onPageChange={setPage}
          />
        )}
      </section>

      {selectedCycle && (
        <>
          <section className={styles.cycleContext} aria-label="轮次信息">
            <div className={styles.schedule}>
              <strong>当前：{selectedCycle.codename}</strong>
              <span
                className="ui-badge ui-badge--neutral"
                style={STATUS_STYLES[selectedCycle.status]}
              >
                {CYCLE_STATUS_LABELS[selectedCycle.status]}
              </span>
              <span>
                报名截止 {formatChinaStandardDateTime(selectedCycle.participationDeadline)}
              </span>
              <span>揭晓 {formatChinaStandardDateTime(selectedCycle.revealAt)}</span>
            </div>
            <div className="auth-actions">
              <Link href={auditHref} className={styles.auditLink}>
                查看本轮审计 ↗
              </Link>
            </div>
          </section>

          <section
            className={styles.panel}
            aria-labelledby="cycle-participants-title"
            id="participants"
          >
            <div className={styles.sectionHead}>
              <div>
                <h2 id="cycle-participants-title">参与者与完成度</h2>
                <p>本轮报名、学校分布与问卷完成情况，一处查看。</p>
              </div>
            </div>
            <CycleStatistics
              key={selectedCycle.id}
              cycleId={selectedCycle.id}
              refreshKey={cycleDataRefreshKey}
              summary={cycleDetail?.cycle.id === selectedCycleId ? cycleDetail.summary : null}
            />
          </section>

          <CycleResults model={model} />
        </>
      )}
      {!selectedCycle && (
        <div className={styles.empty}>选择一个轮次查看数据，或新建下一轮匹配。</div>
      )}

      <CycleEditor model={model} />
    </div>
  );
}
