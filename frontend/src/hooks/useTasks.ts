import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  tasksApi,
  type ListParams,
  type TaskCreate,
  type TaskUpdate,
} from "../api/tasks";

const KEYS = {
  list: (params: ListParams) => ["tasks", "list", params] as const,
  stats: () => ["tasks", "stats"] as const,
  history: (id: string) => ["tasks", "history", id] as const,
};

export function useTaskList(params: ListParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => tasksApi.list(params),
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: () => tasksApi.stats(),
  });
}

export function useTaskHistory(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.history(id) : ["tasks", "history", "none"],
    queryFn: () => tasksApi.history(id!),
    enabled: !!id,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["tasks"] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskCreate) => tasksApi.create(data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      tasksApi.update(id, data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => invalidateAll(qc),
  });
}
