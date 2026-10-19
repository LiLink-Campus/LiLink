"use client";
import { AdminDetailDialog } from "../admin-detail-dialog";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import styles from "./cycles.module.css";
import type { AdminCycle } from "../types";
import { CYCLE_STATUS_LABELS, EDITABLE_CYCLE_STATUSES, ADMIN_NEW_CYCLE_SELECTION } from "./cycle-model";
import type { CyclesController } from "./use-cycles";
const adminStyles = [commonStyles];

export function CycleEditor({ model }: { model: CyclesController }) {
  const { selectedCycleId, setSelectedCycleId, editorOpen, setEditorOpen, cycleForm, setCycleForm, cycleDetail, detailLoading, pending, actionError, cycles, selectedCycle, isSystemLockedCycleStatus, saveCycle, duplicateCycle, exportCycleDetail } = model;
  return (
      <AdminDetailDialog
        open={editorOpen}
        title={cycleForm.cycleId ? "编辑轮次" : "新建轮次"}
        headerLabel="轮次管理"
        onClose={() => {
          setEditorOpen(false);
          if (selectedCycleId === ADMIN_NEW_CYCLE_SELECTION)
            setSelectedCycleId(cycles[0]?.id ?? null);
        }}
      >
        <div className={styles.editor}>
          <h2>{cycleForm.cycleId ? "编辑轮次" : "新建轮次"}</h2>
          {actionError && editorOpen && (
            <p role="alert" className="ui-form-message ui-form-message--error">
              {actionError}
            </p>
          )}
          <form className="auth-stack" onSubmit={saveCycle}>
            <label>
              <span>轮次代号</span>
              <input
                required
                value={cycleForm.codename}
                onChange={(e) => setCycleForm((f) => ({ ...f, codename: e.target.value }))}
              />
            </label>
            <div className={cx(adminStyles, "admin-form-grid")}>
              <label>
                <span>参与截止（北京时间）</span>
                <input
                  required
                  type="datetime-local"
                  value={cycleForm.participationDeadline}
                  onChange={(e) =>
                    setCycleForm((f) => ({
                      ...f,
                      participationDeadline: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>揭晓时间（北京时间）</span>
                <input
                  required
                  type="datetime-local"
                  value={cycleForm.revealAt}
                  onChange={(e) => setCycleForm((f) => ({ ...f, revealAt: e.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>状态</span>
              <select
                value={cycleForm.status}
                disabled={isSystemLockedCycleStatus}
                onChange={(e) =>
                  setCycleForm((f) => ({
                    ...f,
                    status: e.target.value as AdminCycle["status"],
                  }))
                }
              >
                {cycleForm.status === "PREPARING" ? (
                  <option value="PREPARING" disabled>
                    预生成中（系统状态）
                  </option>
                ) : null}
                {cycleForm.status === "REVEALED" ? (
                  <option value="REVEALED" disabled>
                    已揭晓（系统状态）
                  </option>
                ) : null}
                {cycleForm.status === "REVEAL_READY" ? (
                  <option value="REVEAL_READY" disabled>
                    待揭晓（系统状态）
                  </option>
                ) : null}
                {EDITABLE_CYCLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CYCLE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>备注</span>
              <textarea
                rows={4}
                value={cycleForm.notes}
                onChange={(e) => setCycleForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={pending === "save"}
            >
              {pending === "save" ? "保存中..." : cycleForm.cycleId ? "保存轮次" : "创建轮次"}
            </button>
          </form>
          {selectedCycle && (
            <div className={styles.editorTools}>
              <button
                className="ui-button ui-button--secondary"
                type="button"
                disabled={!!pending}
                onClick={() => void duplicateCycle()}
              >
                {pending === "duplicate" ? "复制中…" : "复制为草稿"}
              </button>
              <button
                className="ui-button ui-button--secondary"
                type="button"
                disabled={!cycleDetail || detailLoading}
                onClick={exportCycleDetail}
              >
                导出详情
              </button>
            </div>
          )}
        </div>
      </AdminDetailDialog>

  );
}
