import { randomUUID } from "node:crypto";
import { test as baseTest } from "vitest";

export const BASE = "http://localhost:8000/api/v1";

// ---------- types ----------

export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface Client {
  get<T = unknown>(path: string): Promise<ApiResponse<T>>;
  post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  patch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  del<T = unknown>(path: string): Promise<ApiResponse<T>>;
  raw(path: string, init: RequestInit): Promise<Response>;
}

export interface ApiUser {
  token: string;
  email: string;
  password: string;
  refreshCookie: string | null;
}

// ---------- helpers ----------

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

export function makeApiEmail(): string {
  return `api-${shortId()}@example.com`;
}

export function isoInDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractRefreshCookie(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/refresh_token=[^;]+/);
  return match ? match[0] : null;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- client ----------

export function apiClient(token?: string): Client {
  const baseHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (token) baseHeaders.Authorization = `Bearer ${token}`;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const init: RequestInit = { method, headers: { ...baseHeaders } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, init);
    return {
      status: res.status,
      body: (await parseBody(res)) as T,
      headers: res.headers,
    };
  }

  return {
    get: (p) => request("GET", p),
    post: (p, b) => request("POST", p, b),
    patch: (p, b) => request("PATCH", p, b),
    del: (p) => request("DELETE", p),
    raw: (p, init) =>
      fetch(`${BASE}${p}`, { ...init, headers: { ...baseHeaders, ...(init.headers ?? {}) } }),
  };
}

// ---------- user creation ----------

export async function createTestUser(): Promise<ApiUser> {
  const email = makeApiEmail();
  const password = "Pass1234!";
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Register failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return {
    token: data.access_token,
    email,
    password,
    refreshCookie: extractRefreshCookie(res),
  };
}

// ---------- vitest fixtures ----------

interface Fixtures {
  user: ApiUser;
  client: Client;
}

/**
 * Use this `test` (not the one from "vitest") in API tests. Two fixtures are
 * available; both are lazy — they only run if the test names them.
 *
 *   - `user`   — a freshly registered ApiUser with `{token,email,password,…}`
 *   - `client` — a `Client` already authed as that user
 *
 * Tests that need to assert about anonymous behavior (e.g. "401 without token")
 * simply don't name either fixture and avoid the registration round-trip.
 */
export const test = baseTest.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  user: async ({}, use) => {
    const u = await createTestUser();
    await use(u);
  },
  client: async ({ user }, use) => {
    await use(apiClient(user.token));
  },
});

export { expect, describe, it, beforeAll } from "vitest";
