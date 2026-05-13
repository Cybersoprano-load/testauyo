import { useTaskList } from "../hooks/useTasks";
import type { TaskFilter, TaskSortBy } from "../api/tasks";
import TaskItem from "./TaskItem";

interface Props {
  filter: TaskFilter;
  sortBy: TaskSortBy;
  desc: boolean;
}

export default function TaskList({ filter, sortBy, desc }: Props) {
  const { data, isLoading, error } = useTaskList({
    filter,
    sort_by: sortBy,
    desc,
  });

  if (isLoading) return <div className="empty">Загрузка…</div>;
  if (error) return <div className="error">Не удалось загрузить задачи</div>;
  if (!data || data.items.length === 0) {
    return <div className="empty">Здесь пусто. Добавьте первую задачу выше.</div>;
  }

  return (
    <div>
      {data.items.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  );
}
