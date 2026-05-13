import type { Prisma } from "@prisma/client";

export function todayUtcDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function buildWhere(
  userId: string,
  filter: "all" | "active" | "done" | "overdue",
  today: Date
): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { userId };
  if (filter === "active") return { ...base, isDone: false };
  if (filter === "done") return { ...base, isDone: true };
  if (filter === "overdue") return { ...base, isDone: false, dueDate: { lt: today } };
  return base;
}

export function buildOrderBy(
  sortBy: "due_date" | "created_at" | "title",
  desc: boolean
): Prisma.TaskOrderByWithRelationInput[] {
  const dir = desc ? "desc" : "asc";
  const primary: Prisma.TaskOrderByWithRelationInput =
    sortBy === "due_date"
      ? { dueDate: dir }
      : sortBy === "created_at"
        ? { createdAt: dir }
        : { title: dir };
  return [primary, { createdAt: "desc" }];
}
