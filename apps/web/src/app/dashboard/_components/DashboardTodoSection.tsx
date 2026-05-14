"use client";

import Link from "next/link";
import type { DashboardTask } from "../_lib/types";

const TURN_LABELS: Record<DashboardTask["userTurnStatus"], string> = {
  NOT_STARTED: "可开始",
  WAITING_FOR_COUNTERPART: "等待对方",
  NEEDS_YOUR_RESPONSE: "需要你回应",
  NONE: "已同步",
};

const PROGRESS_LABELS: Record<DashboardTask["progressStatus"], string> = {
  NOT_STARTED: "尚未开始",
  NEGOTIATING: "协商中",
  LOCATION_CONFIRMED_TIME_PENDING: "地点已定，待确认时间",
  TIME_CONFIRMED_LOCATION_PENDING: "时间已定，待确认地点",
  AWAITING_FINAL_CONFIRMATION: "等待最终确认",
  LOCKED: "已确认",
  CANCELED: "已取消",
  EXPIRED: "已过期",
  ARCHIVED: "已归档",
};

export function DashboardTodoSection({ tasks }: { tasks: DashboardTask[] }) {
  const sortedTasks = [...tasks].sort((left, right) => {
    if (right.priority !== left.priority) return right.priority - left.priority;
    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });

  if (sortedTasks.length === 0) return null;

  return (
    <section className="dashboard-todo-section" aria-label="待办事项">
      <div className="dashboard-todo-head">
        <div>
          <p className="eyebrow">To do</p>
          <h2>待办事项</h2>
        </div>
        <span className="app-card-status is-accent">
          {sortedTasks.length} 项
        </span>
      </div>
      <div className="dashboard-todo-list">
        {sortedTasks.map((task) =>
          task.type === "MEETUP" ? (
            <MeetupTodoCard task={task} key={task.id} />
          ) : null,
        )}
      </div>
    </section>
  );
}

function MeetupTodoCard({ task }: { task: DashboardTask }) {
  return (
    <Link className="dashboard-todo-card meetup-todo-card" href={task.href}>
      <div className="dashboard-todo-card-main">
        <span className="dashboard-todo-kind">第一次见面</span>
        <strong>{task.title}</strong>
        <span>{task.text}</span>
      </div>
      <div className="dashboard-todo-card-meta">
        <span>{TURN_LABELS[task.userTurnStatus]}</span>
        <span>{PROGRESS_LABELS[task.progressStatus]}</span>
      </div>
    </Link>
  );
}
