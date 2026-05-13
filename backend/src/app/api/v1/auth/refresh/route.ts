import type { NextRequest } from "next/server";

import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from "@/lib/cookies";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse, json } from "@/lib/http";
import { createToken, verifyToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!token) throw new HttpError(401, "Refresh token missing");

    let sub: string;
    try {
      ({ sub } = await verifyToken(token, "refresh"));
    } catch {
      const res = errorResponse(new HttpError(401, "Invalid or expired refresh token"));
      clearRefreshCookie(res);
      return res;
    }

    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user) {
      const res = errorResponse(new HttpError(401, "User not found"));
      clearRefreshCookie(res);
      return res;
    }

    const access = await createToken(user.id, "access");
    const refresh = await createToken(user.id, "refresh");
    const res = json({
      access_token: access,
      token_type: "bearer",
      user: { id: user.id, email: user.email },
    });
    setRefreshCookie(res, refresh);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
