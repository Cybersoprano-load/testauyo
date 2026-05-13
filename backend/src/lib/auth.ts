import { type NextRequest } from "next/server";
import { prisma } from "./db";
import { HttpError } from "./http";
import { verifyToken } from "./token";

export interface CurrentUser {
  id: string;
  email: string;
}

export async function getCurrentUser(req: NextRequest): Promise<CurrentUser> {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Not authenticated");
  }
  const token = auth.slice(7).trim();
  let sub: string;
  try {
    ({ sub } = await verifyToken(token, "access"));
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user) throw new HttpError(401, "User not found");
  return { id: user.id, email: user.email };
}
