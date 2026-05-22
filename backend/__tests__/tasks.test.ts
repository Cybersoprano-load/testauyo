import { describe, beforeAll, it, expect } from "vitest";

import { BASE, createTestUser, authed, isoInDays } from "./setup";

describe("Tasks API", () => {
  let api: ReturnType<typeof authed>;

  beforeAll(async () => {
    const user = await createTestUser();
    api = authed(user.token);
  });

  it("POST /tasks без токена → 401", async () => {
    const res = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", due_date: isoInDays(1) }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /tasks → 201, отдаёт задачу", async () => {
    const res = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: "Купить хлеб",
        description: "в булочной",
        due_date: isoInDays(3),
      }),
    });
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.id).toBeTypeOf("string");
    expect(task.title).toBe("Купить хлеб");
    expect(task.is_done).toBe(false);
    expect(task.due_date).toBe(isoInDays(3));
  });

  it("POST /tasks без title → 422", async () => {
    const res = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ due_date: isoInDays(1) }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /tasks с пустым title (пробелы) → 422", async () => {
    const res = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "   ", due_date: isoInDays(1) }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /tasks с невалидной датой → 422", async () => {
    const res = await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "X", due_date: "31-12-2026" }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /tasks с битым JSON → 400 (а не 422)", async () => {
    const user = await createTestUser();
    const res = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.token}`,
      },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("GET /tasks → 200, items + total", async () => {
    const res = await api("/tasks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("GET /tasks?filter=overdue фильтрует просроченные", async () => {
    const userApi = authed((await createTestUser()).token);
    await userApi("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Прошлогоднее", due_date: isoInDays(-5) }),
    });
    await userApi("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Через неделю", due_date: isoInDays(7) }),
    });

    const res = await userApi("/tasks?filter=overdue");
    const body = await res.json();
    expect(body.items.every((t: { title: string; is_done: boolean }) => !t.is_done)).toBe(true);
    expect(body.items.map((t: { title: string }) => t.title)).toContain("Прошлогоднее");
    expect(body.items.map((t: { title: string }) => t.title)).not.toContain("Через неделю");
  });

  it("GET /tasks?sort_by=title сортирует по названию", async () => {
    const userApi = authed((await createTestUser()).token);
    for (const title of ["B-second", "C-third", "A-first"]) {
      await userApi("/tasks", {
        method: "POST",
        body: JSON.stringify({ title, due_date: isoInDays(1) }),
      });
    }
    const res = await userApi("/tasks?sort_by=title");
    const body = await res.json();
    const titles = body.items.map((t: { title: string }) => t.title);
    expect(titles).toEqual(["A-first", "B-second", "C-third"]);
  });

  it("PATCH /tasks/[id] меняет статус → /history содержит запись", async () => {
    const userApi = authed((await createTestUser()).token);
    const createRes = await userApi("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Toggle me", due_date: isoInDays(1) }),
    });
    const task = await createRes.json();

    const patchRes = await userApi(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_done: true }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.is_done).toBe(true);
    expect(updated.done_at).not.toBeNull();

    const historyRes = await userApi(`/tasks/${task.id}/history`);
    expect(historyRes.status).toBe(200);
    const history = await historyRes.json();
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[history.length - 1].is_done).toBe(true);
  });

  it("DELETE /tasks/[id] → 204, дальнейший GET 404", async () => {
    const userApi = authed((await createTestUser()).token);
    const created = await (
      await userApi("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Delete me", due_date: isoInDays(1) }),
      })
    ).json();

    const delRes = await userApi(`/tasks/${created.id}`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    const getRes = await userApi(`/tasks/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it("GET /tasks/[id] чужой → 404", async () => {
    const alice = authed((await createTestUser()).token);
    const bob = authed((await createTestUser()).token);

    const aliceTask = await (
      await alice("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Alice private", due_date: isoInDays(1) }),
      })
    ).json();

    const res = await bob(`/tasks/${aliceTask.id}`);
    expect(res.status).toBe(404);
  });

  it("GET /tasks/[id] несуществующая → 404", async () => {
    const res = await api("/tasks/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("GET /tasks/stats отражает каскад действий", async () => {
    const userApi = authed((await createTestUser()).token);

    const t1 = await (
      await userApi("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Done one", due_date: isoInDays(1) }),
      })
    ).json();
    await userApi("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Active one", due_date: isoInDays(5) }),
    });
    await userApi("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Overdue one", due_date: isoInDays(-3) }),
    });
    await userApi(`/tasks/${t1.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_done: true }),
    });

    const res = await userApi("/tasks/stats");
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.total).toBe(3);
    expect(stats.done).toBe(1);
    expect(stats.pending).toBe(2);
    expect(stats.overdue).toBe(1);
  });
});
