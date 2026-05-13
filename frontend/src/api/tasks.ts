import { apiRequest } from "./client";

export type TaskFilter = "all" | "active" | "done" | "overdue";
export type TaskSortBy = "due_date" | "created_at" | "title";

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

export interface TaskList {
  items: TaskPublic[];
  total: number;
}

export interface TaskStats {
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

export interface TaskCreate {
  title: string;
  description?: string | null;
  due_date: string;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  due_date?: string;
  is_done?: boolean;
}

export interface TaskStatusEntry {
  is_done: boolean;
  changed_at: string;
}

export interface ListParams {
  filter?: TaskFilter;
  sort_by?: TaskSortBy;
  desc?: boolean;
  limit?: number;
  offset?: number;
}

function qs(params: ListParams): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
}

export const tasksApi = {
  list: (params: ListParams = {}) =>
    apiRequest<TaskList>(`/api/v1/tasks${qs(params)}`),
  stats: () => apiRequest<TaskStats>("/api/v1/tasks/stats"),
  create: (data: TaskCreate) =>
    apiRequest<TaskPublic>("/api/v1/tasks", { method: "POST", body: data }),
  update: (id: string, data: TaskUpdate) =>
    apiRequest<TaskPublic>(`/api/v1/tasks/${id}`, { method: "PATCH", body: data }),
  remove: (id: string) =>
    apiRequest<void>(`/api/v1/tasks/${id}`, { method: "DELETE" }),
  history: (id: string) =>
    apiRequest<TaskStatusEntry[]>(`/api/v1/tasks/${id}/history`),
};
