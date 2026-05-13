import type { NextRequest } from "next/server";

import { setRefreshCookie } from "@/lib/cookies";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse, json } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { createToken } from "@/lib/token";
import { authCredentialsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const creds = authCredentialsSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email: creds.email } });
    if (!user || !(await verifyPassword(creds.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
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
