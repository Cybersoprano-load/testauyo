import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse, json } from "@/lib/http";
import { serializeHistory } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await ctx.params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task || task.userId !== user.id) {
      throw new HttpError(404, "Task not found");
    }

    const entries = await prisma.taskStatusHistory.findMany({
      where: { taskId: id },
      orderBy: { changedAt: "asc" },
    });

    return json(entries.map(serializeHistory));
  } catch (err) {
    return errorResponse(err);
  }
}
