# API тесты — Node.js (fetch + Vitest)

Тестируем HTTP-эндпоинты бекенда напрямую через fetch. Стек должен быть запущен (`docker compose up`).

## Установка (один раз)

```sh
cd backend
npm install --save-dev vitest @types/node
```

Добавить в `backend/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Создать `backend/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", globals: true },
});
```

---

## Шаблон setup-файла (один раз на все тесты)

`backend/__tests__/setup.ts`:
```ts
const BASE = "http://localhost:8000/api/v1";

export interface ApiUser {
  token: string;
  email: string;
}

// Создаёт уникального пользователя и возвращает его JWT-токен
export async function createTestUser(): Promise<ApiUser> {
  const email = `api-test-${Date.now()}@example.com`;
  const password = "Pass1234!";

  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const data = await res.json();
  return { token: data.access_token, email };
}

// Авторизованный fetch — автоматически добавляет Bearer токен
export function authedFetch(token: string) {
  return (path: string, init: RequestInit = {}) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
}
```

---

## Шаблон тест-файла

`backend/__tests__/tasks.test.ts`:
```ts
import { describe, beforeAll, it, expect } from "vitest";
import { createTestUser, authedFetch } from "./setup";

describe("Tasks API", () => {
  let api: ReturnType<typeof authedFetch>;

  beforeAll(async () => {
    const user = await createTestUser();
    api = authedFetch(user.token);
  });

  it("POST /tasks → 201, возвращает задачу", async () => {
    const res = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: "Тестовая задача",
        due_date: "2025-12-31",
      }),
    });

    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.title).toBe("Тестовая задача");
    expect(task.id).toBeDefined();
    expect(task.is_done).toBe(false);
  });

  it("GET /tasks → 200, массив задач", async () => {
    const res = await api("/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("POST /tasks без title → 422", async () => {
    const res = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ due_date: "2025-12-31" }),
    });
    // Бэкенд возвращает 422 для Zod-валидации; 400 — только для битого JSON.
    expect(res.status).toBe(422);
  });

  it("GET /tasks без токена → 401", async () => {
    const res = await fetch("http://localhost:8000/api/v1/tasks");
    expect(res.status).toBe(401);
  });

  it("GET /tasks/nonexistent → 404", async () => {
    const res = await api("/tasks/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
```

---

## Чеклист для каждого эндпоинта

Каждый эндпоинт нужно покрыть этими сценариями:

| Сценарий | Ожидаемый статус |
|---|---|
| Happy path — корректный запрос | 200, 201 или 204 |
| Валидация — отсутствует/некорректное поле | **422** (Zod) |
| Битый JSON в теле запроса | 400 |
| Авторизация — нет/просроченный токен | 401 |
| Авторизация — чужой ресурс | 404 (этот проект не различает «чужой» и «не существует») |
| Не найдено | 404 |
| Конфликт (дубль email) | 409 |
| Успешный DELETE | 204 (no content) |

---

## Эндпоинты этого проекта

```
POST   /auth/register       { email, password }            → 201
POST   /auth/login          { email, password }            → 200
POST   /auth/refresh        (cookie)                       → 200
POST   /auth/logout                                        → 200
GET    /auth/me             Bearer                         → 200

GET    /tasks               Bearer ?filter=&sort_by=&desc= → 200
GET    /tasks/stats         Bearer                         → 200
POST   /tasks               Bearer { title, description?, due_date } → 201
GET    /tasks/:id           Bearer                         → 200
PATCH  /tasks/:id           Bearer { title?, description?, due_date?, is_done? } → 200
DELETE /tasks/:id           Bearer                         → 204
GET    /tasks/:id/history   Bearer                         → 200
```

---

## Запуск тестов

```sh
cd backend
npm test             # один прогон
npm run test:watch   # watch-режим при разработке
```

> Стек должен быть запущен: `docker compose up` из корня проекта.
