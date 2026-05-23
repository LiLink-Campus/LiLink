import Link from "next/link";
import type { AgendaTodo, AgendaTodoAction } from "../_lib/agenda";
import { AGENDA_ICONS } from "./agenda-icons";

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
    <section className="v2-todo" aria-label="本周待办">
      <header className="v2-todo-head">
        <span className="v2-todo-eyebrow">本周待办 · TO-DO</span>
        <span className="v2-todo-count">
          {doneCount} / {totalCount} 已完成
        </span>
      </header>
      <ul className="v2-todo-list">
        {todos.map((todo) => {
          const Icon = AGENDA_ICONS[todo.icon];
          return (
            <li key={todo.id} className={`v2-todo-row status-${todo.status}`}>
              <span
                className="v2-todo-check"
                role="img"
                aria-label={statusLabel(todo.status)}
              >
                {statusGlyph(todo.status)}
              </span>
              <span className="v2-todo-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="v2-todo-main">
                <p className="v2-todo-title">{todo.title}</p>
                <p className="v2-todo-sub">{todo.subtitle}</p>
                {todo.progress ? (
                  <div className="v2-todo-progress">
                    <div className="v2-todo-progress-bar">
                      <div
                        className="seg-confirmed"
                        style={{
                          width: `${clampPercent(todo.progress.confirmedPercent)}%`,
                        }}
                      />
                      <div
                        className="seg-unconfirmed"
                        style={{
                          width: `${clampPercent(todo.progress.unconfirmedPercent)}%`,
                        }}
                      />
                    </div>
                    <span className="v2-todo-progress-val">
                      {todo.progress.confirmedPercent}%
                    </span>
                  </div>
                ) : null}
              </div>
              {todo.actions.length > 0 ? (
                <div className="v2-todo-actions">
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
