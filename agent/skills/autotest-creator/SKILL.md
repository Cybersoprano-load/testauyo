---
name: autotest-creator
description: Use this skill every time the user asks to write, add, fix, generate, or review any automated test in this project. Triggers on: "напиши тест", "добавь тест", "покрой тестом", "как протестировать", "тест для", "write a test", "add tests", "test this endpoint", "test this component", "unit test", "e2e test", "api test", "проверь", "check that". Always use this skill when working on anything in e2e/, backend tests, or frontend unit tests — even if the request doesn't use the word "test" explicitly.
---

# Autotest Creator

Скилл для быстрого написания качественных тестов в этом проекте. Покрывает три уровня:
- **E2E** — Playwright, Chromium, `e2e/tests/`
- **API** — HTTP-тесты бекенда, Node.js fetch, `backend/__tests__/`
- **Unit** — Vitest + Testing Library, `frontend/src/**/__tests__/`

## Что писать и куда

```
Нужно протестировать...
│
├─ Поведение пользователя в браузере (клики, формы, навигация)?
│  → E2E тест.  Читай: references/e2e-playwright.md
│
├─ HTTP-эндпоинт бекенда (статус, тело ответа, авторизация)?
│  → API тест.  Читай: references/api-testing.md
│
└─ Функцию, хук или компонент в изоляции?
   → Unit тест.  Читай: references/unit-testing.md
```

Если сомневаешься — **предпочитай E2E для UI, API-тест для бекенда**.
Unit-тесты пиши только для логики, которую неудобно проверить через браузер или HTTP.

---

## Критические правила этого проекта

Эти правила нарушать нельзя — они получены из реального опыта отладки.

### 1. Чекбоксы в React — только `.click()`, не `.check()`

```ts
// ✅ ПРАВИЛЬНО — ждём обновления состояния через API
await item.locator(".task-checkbox").click();
await expect(item).toHaveClass(/done/);

// ❌ НЕПРАВИЛЬНО — .check() не работает с controlled-input
await item.locator(".task-checkbox").check();
```

Причина: чекбокс управляется через React state, который обновляется после ответа API. `.check()` не ждёт этого.

### 2. Форма редактирования — искать по CSS-классу

```ts
// ✅ После нажатия "Редактировать" текст задачи уходит в input.value
const editForm = page.locator("form.task-item");
await editForm.locator("input").first().fill("Новое название");
await editForm.getByRole("button", { name: "Сохранить" }).click();

// ❌ hasText перестаёт матчить — текст в форме, не в span
const item = page.locator(".task-item", { hasText: "Старое название" });
await item.getByRole("button", { name: "Редактировать" }).click();
// Дальше hasText уже не работает
```

### 3. Кнопка темы — виннительный падеж в aria-label

```ts
// ✅ ПРАВИЛЬНО
page.getByRole("button", { name: /включить (тёмную|светлую) тему/i })

// ❌ НЕПРАВИЛЬНО — именительный падеж не совпадает
page.getByRole("button", { name: /тёмная тема/i })
```

### 4. Изоляция тестов — уникальный пользователь на каждый тест

```ts
import { makeTestUser, registerViaUi } from "../support/user";

test.beforeEach(async ({ page }) => {
  await registerViaUi(page, makeTestUser()); // уникальный email каждый раз
});
```

Никогда не используй общего пользователя между тестами — они начнут мешать друг другу.

### 5. Next.js 15 — params это Promise

```ts
// ✅ В роутах backend/src/app/api/v1/tasks/[id]/route.ts
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params; // обязательно await!
}
```

---

## Перед тем как писать тест — чеклист

1. **Определи тип**: E2E / API / Unit
2. **Читай нужный reference** (ссылки в дереве выше)
3. **Изолируй данные**: уникальный пользователь, случайные данные
4. **Пиши сначала happy path**, потом граничные случаи
5. **Запусти тест** и убедись, что он проходит
6. **Сломай то, что тестируешь** — тест должен упасть

---

## Структура файлов для новых тестов

```
e2e/tests/           ← E2E тесты (*.spec.ts)
e2e/support/         ← хелперы (user.ts, ...)

backend/__tests__/   ← API тесты (нужно создать папку)
  ├── setup.ts       ← общий хелпер: зарегистрировать пользователя, получить токен
  └── tasks.test.ts  ← тесты конкретного ресурса

frontend/src/        ← Unit тесты рядом с файлом
  └── lib/__tests__/
      └── dates.test.ts
```
