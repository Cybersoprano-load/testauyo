import { useState, type FormEvent } from "react";

import type { TaskPublic } from "../api/tasks";
import { ApiError } from "../api/client";
import { useDeleteTask, useUpdateTask } from "../hooks/useTasks";
import { formatDate, isOverdue } from "../lib/dates";

interface Props {
  task: TaskPublic;
}

export default function TaskItem({ task }: Props) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.due_date);
  const [error, setError] = useState<string | null>(null);

  const overdue = isOverdue(task.due_date, task.is_done);

  const toggle = async () => {
    try {
      await update.mutateAsync({ id: task.id, data: { is_done: !task.is_done } });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Не удалось обновить");
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Название обязательно");
      return;
    }
    try {
      await update.mutateAsync({
        id: task.id,
        data: {
          title: trimmed,
          description: description.trim() || null,
          due_date: dueDate,
        },
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Не удалось сохранить");
    }
  };

  const onDelete = async () => {
    if (!confirm("Удалить задачу?")) return;
    try {
      await remove.mutateAsync(task.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Не удалось удалить");
    }
  };

  if (editing) {
    return (
      <form className="task-item" onSubmit={onSave}>
        <div className="task-body">
          <div className="field">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={500}
              required
              autoFocus
            />
          </div>
          <div className="field">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Описание"
            />
          </div>
          <div className="field">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={update.isPending}>
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(false);
                setTitle(task.title);
                setDescription(task.description ?? "");
                setDueDate(task.due_date);
                setError(null);
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className={`task-item ${task.is_done ? "done" : ""} ${overdue ? "overdue" : ""}`}>
      <input
        type="checkbox"
        className="task-checkbox"
        checked={task.is_done}
        onChange={toggle}
        disabled={update.isPending}
        aria-label={task.is_done ? "Снять отметку" : "Отметить выполненной"}
      />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {task.description && <div className="task-desc">{task.description}</div>}
        <div className="task-meta">
          <span className="due">срок: {formatDate(task.due_date)}</span>
          {task.is_done && task.done_at && (
            <span>выполнено: {formatDate(task.done_at.slice(0, 10))}</span>
          )}
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="task-actions">
        <button
          className="btn btn-ghost"
          onClick={() => setEditing(true)}
          aria-label="Редактировать"
        >
          ✎
        </button>
        <button
          className="btn btn-ghost btn-danger"
          onClick={onDelete}
          disabled={remove.isPending}
          aria-label="Удалить"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
