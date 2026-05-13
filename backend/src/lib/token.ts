import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.jwtSecret);

export type TokenType = "access" | "refresh";

export async function createToken(userId: string, type: TokenType): Promise<string> {
  const ttlSeconds =
    type === "access"
      ? env.accessTokenTtlMinutes * 60
      : env.refreshTokenTtlDays * 24 * 60 * 60;

  return new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(secret);
}

export async function verifyToken(
  token: string,
  expectedType: TokenType
): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  if (payload.type !== expectedType) {
    throw new Error("Wrong token type");
  }
  if (typeof payload.sub !== "string") {
    throw new Error("Missing sub");
  }
  return { sub: payload.sub };
}
