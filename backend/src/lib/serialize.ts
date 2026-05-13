import type { Task, TaskStatusHistory } from "@prisma/client";

function dateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface TaskPublic {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeTask(t: Task): TaskPublic {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    due_date: dateOnly(t.dueDate),
    is_done: t.isDone,
    done_at: t.doneAt?.toISOString() ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

export interface TaskStatusEntry {
  is_done: boolean;
  changed_at: string;
}

export function serializeHistory(e: TaskStatusHistory): TaskStatusEntry {
  return {
    is_done: e.isDone,
    changed_at: e.changedAt.toISOString(),
  };
}
