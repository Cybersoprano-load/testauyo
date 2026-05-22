# Todo

Веб-приложение со списком дел.

**Стек:**
- Backend — **Next.js 15** (App Router) как чистый JSON API + **Prisma** + **PostgreSQL**
- Frontend — **React 18** + **Vite** + **TypeScript** + TanStack Query + React Router
- Auth — кастомный JWT (access в `Authorization: Bearer`, refresh в HttpOnly cookie)

## Возможности
- Регистрация и вход.
- Создание, редактирование, удаление задач (заголовок, описание, срок).
- Фильтры: все / активные / просроченные / выполненные. Сортировка по сроку, дате создания, названию.
- Статистика: всего, активные, просрочено, выполнено.
- История изменений статуса задачи.
- **Светлая и тёмная тема** (переключатель в шапке, выбор сохраняется, реагирует на системную).

## Дизайн
Светло-зелёный акцент, белый фон, кнопки тёмно-зелёные. CSS-переменные в [frontend/src/theme/index.css](frontend/src/theme/index.css) — `--primary` и `--accent` управляют всей палитрой.

## Структура
- `backend/` — Next.js API (`src/app/api/v1/*`, `src/lib/*`, Prisma schema).
- `frontend/` — React + Vite SPA.
- `e2e/` — Playwright end-to-end тесты. См. [e2e/README.md](e2e/README.md).
- `docker-compose.yml` — db + backend + frontend.

## Запуск через Docker
```sh
cd ~/todo-app
cp backend/.env.example backend/.env  # подкорректируйте JWT_SECRET для prod
docker compose up --build
```
- UI: http://localhost:5173
- API: http://localhost:8000 (`/api/v1/*`)

База синхронизируется при старте через `prisma db push` (для dev). Для prod пере­ключайтесь на `prisma migrate deploy` + миграции в `prisma/migrations/`.

## Локальная разработка

### Бэкенд
```sh
cd backend
npm install
cp .env.example .env  # DATABASE_URL под локальный Postgres
npx prisma db push    # создаст таблицы
npm run dev           # http://localhost:8000
```

### Фронтенд
```sh
cd frontend
cp .env.example .env
npm install
npm run dev           # http://localhost:5173, проксирует /api → 8000
```

## API
Все эндпоинты под `/api/v1`. Тело — JSON.

- `POST /api/v1/auth/register` — `{ email, password }`.
- `POST /api/v1/auth/login` — `{ email, password }`.
- `POST /api/v1/auth/refresh` — использует refresh-cookie.
- `POST /api/v1/auth/logout`.
- `GET  /api/v1/auth/me`.
- `GET  /api/v1/tasks` — `?filter=all|active|done|overdue&sort_by=due_date|created_at|title&desc=true|false&limit=…&offset=…`.
- `GET  /api/v1/tasks/stats`.
- `POST /api/v1/tasks` — `{ title, description?, due_date }`.
- `GET  /api/v1/tasks/{id}`.
- `PATCH /api/v1/tasks/{id}`.
- `DELETE /api/v1/tasks/{id}`.
- `GET  /api/v1/tasks/{id}/history`.

## Тесты

Два уровня покрытия — оба требуют поднятого стека (`docker compose up`).

### API (vitest)
Интеграционные тесты `auth/*` и `tasks/*` напрямую через HTTP. Лежат в [backend/__tests__/](backend/__tests__/).

```sh
cd backend
npm install
npm test
```

### E2E (Playwright)
Полный сценарий через настоящий браузер: регистрация, CRUD задач, фильтры, сортировка, статистика, валидация, тема. Лежат в [e2e/](e2e/).

```sh
cd e2e
npm install
npx playwright install chromium
npx playwright test              # обычный прогон
npx playwright test --ui         # интерактивный режим с таймлайном и watch
npx playwright show-report       # HTML-отчёт с trace/видео
```

Подробности и как дебажить — в [e2e/README.md](e2e/README.md).

### Контракт ошибок API
- **422 Unprocessable Entity** — ошибки валидации (Zod). Например, пустой `title`, кривая дата, короткий пароль.
- **400 Bad Request** — только битый JSON в теле запроса.
- **401 Unauthorized** — нет/невалидный токен.
- **404 Not Found** — запрашиваемая задача либо отсутствует, либо принадлежит другому пользователю.
- **409 Conflict** — дубликат email при регистрации.

## Безопасность
- Пароли — `bcryptjs` (12 раундов).
- JWT — `jose` (HS256). Access 15 мин, refresh 7 дней.
- Refresh-токен в HttpOnly cookie, path `/api/v1/auth`, SameSite=Lax.
- CORS из `CORS_ORIGINS` (whitelist) с поддержкой preflight.
