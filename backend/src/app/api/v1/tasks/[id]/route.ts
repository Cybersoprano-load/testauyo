import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse, json, noContent } from "@/lib/http";
import { serializeTask } from "@/lib/serialize";
import { isoToDate } from "@/lib/tasks";
import { taskUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function loadOwned(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.userId !== userId) {
    throw new HttpError(404, "Task not found");
  }
  return task;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await ctx.params;
    const task = await loadOwned(id, user.id);
    return json(serializeTask(task));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await ctx.params;
    const existing = await loadOwned(id, user.id);
    const data = taskUpdateSchema.parse(await req.json());

    const updates: Record<string, unknown> = {};
    if (data.title !== undefined) updates.title = data.title;
    if ("description" in data) updates.description = data.description;
    if (data.due_date !== undefined) updates.dueDate = isoToDate(data.due_date);

    const statusChanged =
      data.is_done !== undefined && data.is_done !== existing.isDone;
    if (statusChanged) {
      updates.isDone = data.is_done;
      updates.doneAt = data.is_done ? new Date() : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.task.update({ where: { id }, data: updates });
      if (statusChanged) {
        await tx.taskStatusHistory.create({
          data: { taskId: id, isDone: u.isDone },
        });
      }
      return u;
    });

    return json(serializeTask(updated));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await ctx.params;
    await loadOwned(id, user.id);
    await prisma.task.delete({ where: { id } });
    return noContent();
  } catch (err) {
    return errorResponse(err);
  }
}
