import Link from "next/link";
import type { AgendaTodo, AgendaTodoAction } from "../_lib/agenda";
import { AGENDA_ICONS } from "./agenda-icons";
import styles from "./TodoChecklist.module.css";

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function statusGlyph(status: AgendaTodo["status"]) {
  if (status === "done") return "✓";
  if (status === "attention") return "!";
  return "";
}

function statusLabel(status: AgendaTodo["status"]) {
  if (status === "done") return "已完成";
  if (status === "attention") return "需关注";
  return "待完成";
}

function actionClassName(variant: AgendaTodoAction["variant"]) {
  if (variant === "primary") return "ui-button ui-button--primary";
  if (variant === "secondary") return "ui-button ui-button--secondary";
  return "ui-button ui-button--ghost";
}

function statusClassName(status: AgendaTodo["status"]) {
  if (status === "done") return styles.done;
  if (status === "attention") return styles.attention;
  return styles.todoStatus;
}

/**
 * The home page's "本周待办" checklist. Each row carries a status dot, an icon,
 * copy, an optional honest split progress bar (confirmed solid + unconfirmed
 * striped), and its actions. Link actions navigate; the others bubble up via
 * onAction so the home client can open the intent sheet or withdraw.
 */
export function TodoChecklist({
  todos,
  doneCount,
  totalCount,
  onAction,
  savingAction,
}: {
  todos: AgendaTodo[];
  doneCount: number;
  totalCount: number;
  onAction: (todoId: AgendaTodo["id"], action: AgendaTodoAction) => void;
  savingAction: boolean;
}) {
  return (
    <section className={styles.todo} aria-label="本周待办">
      <header className={styles.head}>
        <span className={styles.eyebrow}>本周待办 · TO-DO</span>
        <span className={styles.count}>
          {doneCount} / {totalCount} 已完成
        </span>
      </header>
      <ul className={styles.list}>
        {todos.map((todo) => {
          const Icon = AGENDA_ICONS[todo.icon];
          return (
            <li key={todo.id} className={`${styles.row} ${statusClassName(todo.status)}`}>
              <span
                className={styles.check}
                role="img"
                aria-label={statusLabel(todo.status)}
              >
                {statusGlyph(todo.status)}
              </span>
              <span className={styles.icon} aria-hidden="true">
                <Icon />
              </span>
              <div className={styles.main}>
                <p className={styles.title}>{todo.title}</p>
                <p className={styles.sub}>{todo.subtitle}</p>
                {todo.progress ? (
                  <div className={styles.progress}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.confirmed}
                        style={{
                          width: `${clampPercent(todo.progress.confirmedPercent)}%`,
                        }}
                      />
                      <div
                        className={styles.unconfirmed}
                        style={{
                          width: `${clampPercent(todo.progress.unconfirmedPercent)}%`,
                        }}
                      />
                    </div>
                    <span className={styles.progressVal}>
                      {todo.progress.confirmedPercent}%
                    </span>
                  </div>
                ) : null}
              </div>
              {todo.actions.length > 0 ? (
                <div className={styles.actions}>
                  {todo.actions.map((action, index) =>
                    action.kind === "link" && action.href ? (
                      <Link
                        key={`${todo.id}-${index}`}
                        href={action.href}
                        className={actionClassName(action.variant)}
                      >
                        {action.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        key={`${todo.id}-${index}`}
                        className={actionClassName(action.variant)}
                        onClick={() => onAction(todo.id, action)}
                        disabled={savingAction}
                      >
                        {savingAction && action.loadingLabel
                          ? `${action.loadingLabel}…`
                          : action.label}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
