import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    return json(user);
  } catch (err) {
    return errorResponse(err);
  }
}
