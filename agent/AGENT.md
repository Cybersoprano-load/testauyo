# AGENT.md — контекст проекта для Claude

Этот файл читается в начале каждой сессии. Содержит всё, что нужно знать перед тем как трогать код.

---

## Проект

Веб-приложение «Список дел» (Todo App). Монорепо в `~/todo-app/`.

**GitHub:** `Cybersoprano-load/testauyo`
**Пользователь:** Виталий, начинающий разработчик. Объяснения давать простым языком, без лишнего жаргона.

---

## Стек

| Слой | Технология |
|---|---|
| Backend | Next.js 15 (App Router) — только API, без страниц |
| ORM | Prisma + PostgreSQL |
| Frontend | React 18 + Vite + TypeScript |
| State/fetch | TanStack Query v5 |
| Routing | React Router |
| Auth | Кастомный JWT: `jose` (HS256), `bcryptjs` (12 раундов) |
| E2E тесты | Playwright (Chromium) |
| Инфра | Docker Compose |

---

## Архитектура

```
todo-app/
├── backend/          # Next.js 15 API (src/app/api/v1/*)
│   ├── prisma/       # schema.prisma — модели User, Task, TaskStatusHistory
│   ├── src/
│   │   ├── app/api/v1/   # роуты: auth/*, tasks/*, tasks/[id]/*
│   │   ├── lib/          # token.ts, cookies.ts, validation.ts, prisma.ts
│   │   └── middleware.ts # CORS для всех /api/* маршрутов
│   ├── __tests__/        # vitest API тесты (auth.test.ts, tasks.test.ts, setup.ts)
│   └── docker-entrypoint.sh  # prisma db push → next start -p 8000
├── frontend/         # React + Vite SPA
│   └── src/
│       ├── api/      # client.ts (fetch с авто-refresh), tasks.ts
│       ├── components/   # TaskForm, TaskItem, TaskList, ThemeToggle, Stats...
│       ├── hooks/    # useTasks.ts (TanStack Query)
│       ├── lib/      # dates.ts
│       └── theme/    # index.css (CSS-переменные), ThemeContext.tsx
├── e2e/              # Playwright тесты
│   ├── tests/        # auth.spec.ts, tasks.spec.ts, theme.spec.ts
│   └── support/      # user.ts (makeTestUser, registerViaUi, loginViaUi)
├── agent/            # Claude-специфичные файлы
│   ├── AGENT.md      # этот файл
│   └── skills/       # скачанные скиллы
└── docker-compose.yml
```

---

## Важные решения и почему они приняты

### Auth
- **`jose`** вместо `jsonwebtoken` — edge-compatible, работает в Next.js middleware.
- **`bcryptjs`** вместо `argon2` — pure JS, не требует нативной компиляции в Docker.
- Access-токен: 15 мин, в заголовке `Authorization: Bearer`.
- Refresh-токен: 7 дней, HttpOnly cookie, `path: "/api/v1/auth"`, `SameSite: lax`.
- Клиент (`frontend/src/api/client.ts`) автоматически делает retry через `/auth/refresh` при 401.

### База данных
- `prisma db push` (не `migrate`) — для dev/docker достаточно, нет папки migrations.
- Для prod: переключиться на `prisma migrate deploy`.
- Нет `output: "standalone"` в next.config.ts — иначе Prisma client не копируется корректно в Docker.

### Тема (light/dark)
- CSS-переменные в `frontend/src/theme/index.css`, управляются через `[data-theme="light|dark"]` на `<html>`.
- Анти-флеш скрипт в `index.html` устанавливает `data-theme` до загрузки React.
- `ThemeContext.tsx`: читает `localStorage`, fallback на `prefers-color-scheme`.
- Кнопка-переключатель: `aria-label` в винительном падеже — «Включить тёмную тему» / «Включить светлую тему».

---

## Критические gotchas (не наступать снова)

### Next.js 15 — динамические роуты
Параметры роута — это **Promise**, не объект:
```ts
// ✅ правильно
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
}
```

### Playwright — чекбокс controlled-input
`.check()` не работает на controlled React-инпутах (состояние обновляется асинхронно через API).
```ts
// ✅ правильно
await item.locator(".task-checkbox").click();
await expect(item).toHaveClass(/done/);

// ❌ неправильно
await item.locator(".task-checkbox").check();
```

### Playwright — редактирование задачи
После открытия формы редактирования `hasText: "Старое название"` перестаёт матчить — текст переходит в `input.value`. Искать форму по CSS-классу:
```ts
const editForm = page.locator("form.task-item");
await editForm.locator("input").first().fill("Новое название");
```

### Playwright — aria-label кнопки темы
Regex для локатора: `/включить (тёмную|светлую) тему/i` (винительный падеж, не именительный).

### API: код валидации — 422, не 400
Бэкенд (`src/lib/http.ts`) возвращает **422 Unprocessable Entity** для `ZodError` (валидация) и **400** только для битого JSON. Это сознательное решение в духе FastAPI. В скилле [autotest-creator/references/api-testing.md](../agent/skills/autotest-creator/references/api-testing.md) исторически указывалось 400 — теперь исправлено.

### Семантика «активные» vs «просроченные»
В API:
- фильтр `active` = `isDone: false` (включает просроченные),
- `stats.pending` = `total - done` (тоже включает просроченные).

UI «Активные» / стат «активные» используют именно `pending`. Просроченные — **подмножество** активных, а не отдельная группа. При написании тестов на статистику: если задача просрочена и не выполнена — она увеличит и `активные`, и `просрочено`.

### bcrypt: dev на 4 раундах, prod на 12
`backend/src/lib/password.ts` читает `BCRYPT_ROUNDS` из env (clamp 4..15, default 12). В [docker-compose.yml](../docker-compose.yml) для backend стоит `BCRYPT_ROUNDS=4` — это **только локально**, чтобы регистрация в API-тестах была мгновенной. В реальном prod-окружении переменную надо либо убрать, либо явно поставить `12`.

### E2E: последовательное создание нескольких задач
После клика «Добавить» нужно дождаться появления карточки в списке перед следующим `fill()` — иначе следующий submit стрельнёт по ещё не очищенной форме (мутация TanStack Query завершается асинхронно). Паттерн:
```ts
const addTask = async (title: string, due: number) => {
  await page.getByLabel("Что нужно сделать").fill(title);
  await page.getByLabel("Срок").fill(isoInDays(due));
  await page.getByRole("button", { name: "Добавить" }).click();
  await expect(page.locator(".task-item", { hasText: title })).toBeVisible();
};
```

---

## Как запускать

### Полный стек (Docker)
```sh
cd ~/todo-app
docker compose up --build
# UI: http://localhost:5173
# API: http://localhost:8000/api/health
```

### E2E тесты (стек должен быть запущен)
```sh
cd ~/todo-app/e2e
npx playwright test              # headless
npx playwright test --ui         # интерактивный режим
npx playwright show-report       # HTML-отчёт после падения
```

### API тесты (стек должен быть запущен)
```sh
cd ~/todo-app/backend
npm test                          # один прогон
npm run test:watch                # watch-режим
```
Тесты создают уникальных пользователей (`api-{uuid16}@example.com`), не трогают реальные данные. Очистка — тем же SQL что и для e2e (см. секцию «E2E тесты — изоляция данных»), просто `WHERE email LIKE 'api-%'`.

### Локальная разработка без Docker
```sh
# Backend
cd backend && npm run dev        # :8000

# Frontend
cd frontend && npm run dev       # :5173, проксирует /api → 8000
```

---

## E2E тесты — изоляция данных

Каждый тест создаёт уникального пользователя: `e2e-{random16}@example.com` / `Pass1234!`.
Тесты не трогают реальные данные пользователей.

Очистка тестовых записей:
```sh
docker compose exec db psql -U todo -d todo -c "DELETE FROM users WHERE email LIKE 'e2e-%';"
```

---

## Скиллы

| Скилл | Путь | Когда использовать |
|---|---|---|
| `skill-creator` | `agent/skills/skill-creator/SKILL.md` | При создании новых скиллов |
| `playwright-best-practices` | `agent/skills/playwright-best-practices/SKILL.md` | При написании/отладке Playwright тестов (общее) |
| `autotest-creator` | `agent/skills/autotest-creator/SKILL.md` | При написании любых тестов в **этом** проекте: E2E/API/Unit |
| `space-video-reporter` | `agent/skills/space-video-reporter/SKILL.md` | Сборка 2-минутного видеоотчёта со звуком на космическую тему (слайды: запуск / звёздное поле / планета / крушение / спасение) |

---

## Браузерное тестирование через Playwright MCP

В проекте подключён MCP-сервер `@playwright/mcp` (конфиг в [`.mcp.json`](../.mcp.json)).
Это значит — я могу **сам** открывать сайт в браузере, кликать, заполнять формы, делать скриншоты, проверять консоль и сеть.

### Когда использовать
- Нужно проверить новую фичу через UI вживую
- Воспроизвести баг и показать что именно ломается
- Просмотреть JS-ошибки в консоли на конкретной странице
- Сделать скриншот для документации

### Когда НЕ использовать
- Регрессионные прогоны — для этого есть `e2e/tests/*.spec.ts`
- Скриптовые тесты в CI — там Playwright запускается напрямую, без MCP

### Перед запуском
1. Стек должен быть поднят: `docker compose up`
2. Проверить `http://localhost:5173` — открывается страница логина
3. Если MCP не отвечает — `/mcp` в Claude Code покажет статус сервера

### Доступные инструменты MCP
- `browser_navigate(url)` — открыть URL
- `browser_snapshot()` — accessibility tree страницы (основной способ «видеть»)
- `browser_click(ref)` / `browser_type(ref, text)` — взаимодействие
- `browser_take_screenshot()` — PNG-скриншот
- `browser_console_messages()` / `browser_network_requests()` — диагностика
- `browser_wait_for({text})` — ждать появления элемента
