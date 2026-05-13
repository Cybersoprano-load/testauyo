import { useTaskStats } from "../hooks/useTasks";

export default function TaskStats() {
  const { data, isLoading } = useTaskStats();
  const s = data ?? { total: 0, done: 0, pending: 0, overdue: 0 };
  return (
    <div className="stats" aria-busy={isLoading}>
      <div className="stat">
        <div className="value">{s.total}</div>
        <div className="label">всего</div>
      </div>
      <div className="stat">
        <div className="value">{s.pending}</div>
        <div className="label">активные</div>
      </div>
      <div className="stat danger">
        <div className="value">{s.overdue}</div>
        <div className="label">просрочено</div>
      </div>
      <div className="stat">
        <div className="value">{s.done}</div>
        <div className="label">выполнено</div>
      </div>
    </div>
  );
}
