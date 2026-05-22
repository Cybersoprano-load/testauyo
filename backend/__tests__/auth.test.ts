import { describe, it, expect } from "vitest";

import { BASE, createTestUser, authed, makeApiEmail } from "./setup";

describe("Auth API", () => {
  it("POST /auth/register → 201, отдаёт access_token и user", async () => {
    const email = makeApiEmail();
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Pass1234!" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.access_token).toBeTypeOf("string");
    expect(body.token_type).toBe("bearer");
    expect(body.user.email).toBe(email);
    expect(res.headers.get("set-cookie")).toMatch(/refresh_token=/);
  });

  it("POST /auth/register повторный email → 409", async () => {
    const user = await createTestUser();
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "Pass1234!" }),
    });
    expect(res.status).toBe(409);
  });

  it("POST /auth/register с коротким паролем → 400", async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: makeApiEmail(), password: "short" }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /auth/register с невалидным email → 422", async () => {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "Pass1234!" }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /auth/login верными данными → 200 + токен", async () => {
    const user = await createTestUser();
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTypeOf("string");
  });

  it("POST /auth/login неверным паролем → 401", async () => {
    const user = await createTestUser();
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "WrongPass1!" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /auth/me без токена → 401", async () => {
    const res = await fetch(`${BASE}/auth/me`);
    expect(res.status).toBe(401);
  });

  it("GET /auth/me с токеном → 200, отдаёт пользователя", async () => {
    const user = await createTestUser();
    const api = authed(user.token);
    const res = await api("/auth/me");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(user.email);
    expect(body.id).toBeTypeOf("string");
  });

  it("POST /auth/refresh с refresh-cookie → 200, новые токены", async () => {
    const user = await createTestUser();
    if (!user.refreshCookie) throw new Error("no refresh cookie from register");

    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: user.refreshCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTypeOf("string");
  });

  it("POST /auth/refresh без cookie → 401", async () => {
    const res = await fetch(`${BASE}/auth/refresh`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("POST /auth/logout → 200 + очищает refresh-cookie", async () => {
    const res = await fetch(`${BASE}/auth/logout`, { method: "POST" });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/refresh_token=;/);
  });
});
