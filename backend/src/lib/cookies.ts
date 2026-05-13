import type { NextResponse } from "next/server";
import { env } from "./env";

export const REFRESH_COOKIE = "refresh_token";
const COOKIE_PATH = "/api/v1/auth";

export function setRefreshCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: REFRESH_COOKIE,
    value: token,
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60,
  });
}

export function clearRefreshCookie(res: NextResponse): void {
  res.cookies.set({
    name: REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
  });
}
