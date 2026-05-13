import { useState } from "react";

import { useAuth } from "../auth/AuthContext";
import TaskForm from "../components/TaskForm";
import TaskList from "../components/TaskList";
import TaskStats from "../components/TaskStats";
import ThemeToggle from "../components/ThemeToggle";
import type { TaskFilter, TaskSortBy } from "../api/tasks";

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "overdue", label: "Просроченные" },
  { value: "done", label: "Выполненные" },
];

export default function TasksPage() {
  const { user, logout } = useAuth();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [sortBy, setSortBy] = useState<TaskSortBy>("due_date");
  const [desc, setDesc] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          <span className="brand-dot" />
          Мои задачи
        </h1>
        <div className="row">
          <ThemeToggle />
          <span className="muted">{user?.email}</span>
          <button className="btn btn-ghost" onClick={() => logout()}>
            Выйти
          </button>
        </div>
      </header>

      <TaskStats />

      <div className="card">
        <TaskForm />
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div className="filters">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={`filter-btn ${filter === f.value ? "active" : ""}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="row">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as TaskSortBy)}
              style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <option value="due_date">По сроку</option>
              <option value="created_at">По дате создания</option>
              <option value="title">По названию</option>
            </select>
            <button
              className="btn btn-ghost"
              onClick={() => setDesc((d) => !d)}
              title={desc ? "По убыванию" : "По возрастанию"}
              aria-label="Изменить направление сортировки"
            >
              {desc ? "↓" : "↑"}
            </button>
          </div>
        </div>
        <TaskList filter={filter} sortBy={sortBy} desc={desc} />
      </div>
    </div>
  );
}
