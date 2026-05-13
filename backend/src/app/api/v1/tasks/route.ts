import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse, json } from "@/lib/http";
import { serializeTask } from "@/lib/serialize";
import { buildOrderBy, buildWhere, isoToDate, todayUtcDateOnly } from "@/lib/tasks";
import { listQuerySchema, taskCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const params = listQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const today = todayUtcDateOnly();
    const where = buildWhere(user.id, params.filter, today);

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: buildOrderBy(params.sort_by, params.desc),
        take: params.limit,
        skip: params.offset,
      }),
      prisma.task.count({ where }),
    ]);

    return json({
      items: items.map(serializeTask),
      total,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const body = await req.json();
    const data = taskCreateSchema.parse(body);

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          userId: user.id,
          title: data.title,
          description: data.description,
          dueDate: isoToDate(data.due_date),
          isDone: false,
        },
      });
      await tx.taskStatusHistory.create({
        data: { taskId: created.id, isDone: false },
      });
      return created;
    });

    return json(serializeTask(task), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
