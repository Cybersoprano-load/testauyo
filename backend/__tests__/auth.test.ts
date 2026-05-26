import {
  BASE,
  apiClient,
  createTestUser,
  describe,
  expect,
  makeApiEmail,
  test,
} from "./setup";

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: { id: string; email: string };
}

const PASSWORD = "Pass1234!";
const anon = apiClient();

describe.concurrent("Auth API", () => {
  test("POST /auth/register → 201, отдаёт access_token и user", async () => {
    const email = makeApiEmail();
    const { status, body, headers } = await anon.post<AuthResponse>("/auth/register", {
      email,
      password: PASSWORD,
    });
    expect(status).toBe(201);
    expect(body.access_token).toBeTypeOf("string");
    expect(body.token_type).toBe("bearer");
    expect(body.user.email).toBe(email);
    expect(headers.get("set-cookie")).toMatch(/refresh_token=/);
  });

  test("POST /auth/register повторный email → 409", async ({ user }) => {
    const { status } = await anon.post("/auth/register", {
      email: user.email,
      password: PASSWORD,
    });
    expect(status).toBe(409);
  });

  test("POST /auth/register с коротким паролем → 422", async () => {
    const { status } = await anon.post("/auth/register", {
      email: makeApiEmail(),
      password: "short",
    });
    expect(status).toBe(422);
  });

  test("POST /auth/register с невалидным email → 422", async () => {
    const { status } = await anon.post("/auth/register", {
      email: "not-an-email",
      password: PASSWORD,
    });
    expect(status).toBe(422);
  });

  test("POST /auth/login верными данными → 200 + токен", async ({ user }) => {
    const { status, body } = await anon.post<AuthResponse>("/auth/login", {
      email: user.email,
      password: user.password,
    });
    expect(status).toBe(200);
    expect(body.access_token).toBeTypeOf("string");
  });

  test("POST /auth/login неверным паролем → 401", async ({ user }) => {
    const { status } = await anon.post("/auth/login", {
      email: user.email,
      password: "WrongPass1!",
    });
    expect(status).toBe(401);
  });

  test("GET /auth/me без токена → 401", async () => {
    const { status } = await anon.get("/auth/me");
    expect(status).toBe(401);
  });

  test("GET /auth/me с токеном → 200, отдаёт пользователя", async ({ user, client }) => {
    const { status, body } = await client.get<{ id: string; email: string }>("/auth/me");
    expect(status).toBe(200);
    expect(body.email).toBe(user.email);
    expect(body.id).toBeTypeOf("string");
  });

  test("POST /auth/refresh с refresh-cookie → 200, новые токены", async () => {
    // Need the fresh refresh cookie from register — fixture doesn't expose it via Client,
    // so use createTestUser directly and call /refresh manually with the cookie header.
    const u = await createTestUser();
    if (!u.refreshCookie) throw new Error("no refresh cookie from register");
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { Cookie: u.refreshCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthResponse;
    expect(body.access_token).toBeTypeOf("string");
  });

  test("POST /auth/refresh без cookie → 401", async () => {
    const { status } = await anon.post("/auth/refresh");
    expect(status).toBe(401);
  });

  test("POST /auth/logout → 200 + очищает refresh-cookie", async () => {
    const { status, headers } = await anon.post("/auth/logout");
    expect(status).toBe(200);
    expect(headers.get("set-cookie") ?? "").toMatch(/refresh_token=;/);
  });
});
