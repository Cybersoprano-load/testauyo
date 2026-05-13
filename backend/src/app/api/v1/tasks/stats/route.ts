import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";
import { todayUtcDateOnly } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const today = todayUtcDateOnly();

    const [total, done, overdue] = await Promise.all([
      prisma.task.count({ where: { userId: user.id } }),
      prisma.task.count({ where: { userId: user.id, isDone: true } }),
      prisma.task.count({
        where: { userId: user.id, isDone: false, dueDate: { lt: today } },
      }),
    ]);

    return json({
      total,
      done,
      pending: total - done,
      overdue,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
