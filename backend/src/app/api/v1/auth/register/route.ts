import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { setRefreshCookie } from "@/lib/cookies";
import { prisma } from "@/lib/db";
import { HttpError, errorResponse, json } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { createToken } from "@/lib/token";
import { authCredentialsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const creds = authCredentialsSchema.parse(body);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: creds.email,
          passwordHash: await hashPassword(creds.password),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new HttpError(409, "Email already registered");
      }
      throw e;
    }

    const access = await createToken(user.id, "access");
    const refresh = await createToken(user.id, "refresh");

    const res = json(
      {
        access_token: access,
        token_type: "bearer",
        user: { id: user.id, email: user.email },
      },
      201
    );
    setRefreshCookie(res, refresh);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
