import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { useCreateTask } from "../hooks/useTasks";
import { todayIso } from "../lib/dates";

export default function TaskForm() {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Введите название задачи");
      return;
    }
    try {
      await create.mutateAsync({
        title: trimmed,
        description: description.trim() || null,
        due_date: dueDate,
      });
      setTitle("");
      setDescription("");
      setDueDate(todayIso());
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Не удалось создать задачу");
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="title">Что нужно сделать</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
          placeholder="Купить хлеб"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="description">Описание (необязательно)</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="Подробности…"
        />
      </div>
      <div className="row-between" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
          <label htmlFor="due">Срок</label>
          <input
            id="due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? "Сохранение…" : "Добавить"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
