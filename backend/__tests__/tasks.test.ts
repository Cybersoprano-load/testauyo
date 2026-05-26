import {
  BASE,
  apiClient,
  createTestUser,
  describe,
  expect,
  isoInDays,
  test,
} from "./setup";

interface TaskPublic {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskList {
  items: TaskPublic[];
  total: number;
}

interface Stats {
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

interface HistoryEntry {
  is_done: boolean;
  changed_at: string;
}

const anon = apiClient();

describe.concurrent("Tasks API", () => {
  // ---------- auth gate ----------

  test("POST /tasks без токена → 401", async () => {
    const { status } = await anon.post("/tasks", { title: "x", due_date: isoInDays(1) });
    expect(status).toBe(401);
  });

  test("GET /tasks без токена → 401", async () => {
    const { status } = await anon.get("/tasks");
    expect(status).toBe(401);
  });

  // ---------- validation ----------

  test("POST /tasks → 201, отдаёт задачу", async ({ client }) => {
    const { status, body } = await client.post<TaskPublic>("/tasks", {
      title: "Купить хлеб",
      description: "в булочной",
      due_date: isoInDays(3),
    });
    expect(status).toBe(201);
    expect(body.id).toBeTypeOf("string");
    expect(body.title).toBe("Купить хлеб");
    expect(body.is_done).toBe(false);
    expect(body.due_date).toBe(isoInDays(3));
  });

  test("POST /tasks без title → 422", async ({ client }) => {
    const { status } = await client.post("/tasks", { due_date: isoInDays(1) });
    expect(status).toBe(422);
  });

  test("POST /tasks с пустым title (пробелы) → 422", async ({ client }) => {
    const { status } = await client.post("/tasks", { title: "   ", due_date: isoInDays(1) });
    expect(status).toBe(422);
  });

  test("POST /tasks с невалидной датой → 422", async ({ client }) => {
    const { status } = await client.post("/tasks", { title: "X", due_date: "31-12-2026" });
    expect(status).toBe(422);
  });

  test("POST /tasks с битым JSON → 400 (а не 422)", async ({ user }) => {
    const res = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  // ---------- listing ----------

  test("GET /tasks → 200, items + total", async ({ client }) => {
    const { status, body } = await client.get<TaskList>("/tasks");
    expect(status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  test("GET /tasks?filter=overdue фильтрует просроченные", async ({ client }) => {
    await Promise.all([
      client.post("/tasks", { title: "Прошлогоднее", due_date: isoInDays(-5) }),
      client.post("/tasks", { title: "Через неделю", due_date: isoInDays(7) }),
    ]);
    const { body } = await client.get<TaskList>("/tasks?filter=overdue");
    const titles = body.items.map((t) => t.title);
    expect(body.items.every((t) => !t.is_done)).toBe(true);
    expect(titles).toContain("Прошлогоднее");
    expect(titles).not.toContain("Через неделю");
  });

  test("GET /tasks?sort_by=title сортирует по названию", async ({ client }) => {
    await Promise.all(
      ["B-second", "C-third", "A-first"].map((title) =>
        client.post("/tasks", { title, due_date: isoInDays(1) }),
      ),
    );
    const { body } = await client.get<TaskList>("/tasks?sort_by=title");
    expect(body.items.map((t) => t.title)).toEqual(["A-first", "B-second", "C-third"]);
  });

  // ---------- state changes ----------

  test("PATCH /tasks/[id] меняет статус → /history содержит запись", async ({ client }) => {
    const { body: task } = await client.post<TaskPublic>("/tasks", {
      title: "Toggle me",
      due_date: isoInDays(1),
    });

    const { status: patchStatus, body: updated } = await client.patch<TaskPublic>(
      `/tasks/${task.id}`,
      { is_done: true },
    );
    expect(patchStatus).toBe(200);
    expect(updated.is_done).toBe(true);
    expect(updated.done_at).not.toBeNull();

    const { status: historyStatus, body: history } = await client.get<HistoryEntry[]>(
      `/tasks/${task.id}/history`,
    );
    expect(historyStatus).toBe(200);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[history.length - 1].is_done).toBe(true);
  });

  test("DELETE /tasks/[id] → 204, дальнейший GET 404", async ({ client }) => {
    const { body: created } = await client.post<TaskPublic>("/tasks", {
      title: "Delete me",
      due_date: isoInDays(1),
    });
    const del = await client.del(`/tasks/${created.id}`);
    expect(del.status).toBe(204);
    const get = await client.get(`/tasks/${created.id}`);
    expect(get.status).toBe(404);
  });

  // ---------- isolation / 404 ----------

  test("GET /tasks/[id] чужой → 404", async ({ client }) => {
    const bob = await createTestUser();
    const bobClient = apiClient(bob.token);
    const { body: aliceTask } = await client.post<TaskPublic>("/tasks", {
      title: "Alice private",
      due_date: isoInDays(1),
    });
    const { status } = await bobClient.get(`/tasks/${aliceTask.id}`);
    expect(status).toBe(404);
  });

  test("GET /tasks/[id] несуществующая → 404", async ({ client }) => {
    const { status } = await client.get("/tasks/00000000-0000-0000-0000-000000000000");
    expect(status).toBe(404);
  });

  // ---------- aggregates ----------

  test("GET /tasks/stats отражает каскад действий", async ({ client }) => {
    const [doneOne] = await Promise.all([
      client.post<TaskPublic>("/tasks", { title: "Done one", due_date: isoInDays(1) }),
      client.post<TaskPublic>("/tasks", { title: "Active one", due_date: isoInDays(5) }),
      client.post<TaskPublic>("/tasks", { title: "Overdue one", due_date: isoInDays(-3) }),
    ]);

    await client.patch(`/tasks/${doneOne.body.id}`, { is_done: true });

    const { status, body: stats } = await client.get<Stats>("/tasks/stats");
    expect(status).toBe(200);
    expect(stats).toMatchObject({ total: 3, done: 1, pending: 2, overdue: 1 });
  });
});
