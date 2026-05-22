import { randomUUID } from "node:crypto";

export const BASE = "http://localhost:8000/api/v1";

export interface ApiUser {
  token: string;
  email: string;
  password: string;
  refreshCookie: string | null;
}

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function makeApiEmail(): string {
  return `api-${shortId()}@example.com`;
}

function extractRefreshCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/refresh_token=[^;]+/);
  return match ? match[0] : null;
}

export async function createTestUser(): Promise<ApiUser> {
  const email = makeApiEmail();
  const password = "Pass1234!";

  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Register failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    token: data.access_token,
    email,
    password,
    refreshCookie: extractRefreshCookie(res),
  };
}

export function authed(token: string) {
  return (path: string, init: RequestInit = {}) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
}

export function isoInDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
