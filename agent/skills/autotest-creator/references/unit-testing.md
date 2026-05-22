# Unit тесты — Vitest + Testing Library (TypeScript)

Тестируем отдельные функции и компоненты в изоляции, без браузера и без сети.

## Когда писать unit-тест, а не E2E

- Тестируется **чистая функция** (dates.ts, validation, transform)
- Компонент имеет **сложную внутреннюю логику** (форматирование, условный рендер)
- Нужно проверить **много граничных случаев** быстро
- E2E для этого сценария был бы слишком медленным или хрупким

Если можно проверить через браузер — пиши E2E.

---

## Установка (один раз для frontend)

```sh
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

Добавить в `frontend/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Создать `frontend/src/test-setup.ts`:
```ts
import "@testing-library/jest-dom";
```

Добавить в `frontend/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## Тест чистой функции

`frontend/src/lib/__tests__/dates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { todayIso } from "../dates";

describe("todayIso", () => {
  it("возвращает строку формата YYYY-MM-DD", () => {
    const result = todayIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("возвращает сегодняшнюю дату", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(todayIso()).toBe(today);
  });
});
```

---

## Тест React-компонента

`frontend/src/components/__tests__/TaskForm.test.tsx`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TaskForm from "../TaskForm";

// Мок хука — не делаем реальный запрос к API
vi.mock("../../hooks/useTasks", () => ({
  useCreateTask: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("TaskForm", () => {
  it("отображает поля формы", () => {
    renderWithQuery(<TaskForm />);
    expect(screen.getByLabelText("Что нужно сделать")).toBeInTheDocument();
    expect(screen.getByLabelText("Описание (необязательно)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить" })).toBeInTheDocument();
  });

  it("показывает ошибку при пустом названии", async () => {
    renderWithQuery(<TaskForm />);
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(await screen.findByText("Введите название задачи")).toBeInTheDocument();
  });
});
```

---

## Мокирование модулей

```ts
// Мок функции
vi.mock("../api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

// Мок с восстановлением
beforeEach(() => vi.clearAllMocks());

// Шпион на вызов (не заменяет реализацию)
const spy = vi.spyOn(console, "error").mockImplementation(() => {});
```

---

## Запуск

```sh
cd frontend
npm test             # один прогон
npm run test:watch   # watch при написании тестов
```

---

## Что тестировать unit-тестами в этом проекте

| Файл | Что проверить |
|---|---|
| `frontend/src/lib/dates.ts` | `todayIso()` возвращает правильный формат |
| `frontend/src/components/TaskForm.tsx` | Валидация пустого заголовка |
| `frontend/src/components/ThemeToggle.tsx` | Переключает тему при клике |
| `backend/src/lib/validation.ts` | Zod-схемы отклоняют невалидные данные |
| `backend/src/lib/token.ts` | createToken / verifyToken round-trip |
