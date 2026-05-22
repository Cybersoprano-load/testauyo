# E2E тесты — Playwright (TypeScript)

Тесты живут в `e2e/tests/*.spec.ts`. Запускаются через Chromium против реального стека (Docker).

## Запуск

```sh
cd e2e
npx playwright test              # headless, быстро
npx playwright test --ui         # GUI с таймлайном, для разработки
npx playwright test -g "название" # только один тест
npx playwright show-report       # HTML отчёт после падения
```

---

## Шаблон нового spec-файла

```ts
import { expect, test } from "@playwright/test";
import { makeTestUser, registerViaUi } from "../support/user";

// Хелпер для дат (n > 0 = будущее, n < 0 = прошлое)
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("название группы", () => {
  // Если все тесты требуют авторизации — используй beforeEach
  test.beforeEach(async ({ page }) => {
    await registerViaUi(page, makeTestUser());
  });

  test("что должно произойти", async ({ page }) => {
    // arrange — подготовь состояние
    // act — действие пользователя
    // assert — проверь результат
  });
});
```

---

## Локаторы — от лучшего к худшему

```ts
// ✅ Лучшее — role + name (стабильно, описывает UX)
page.getByRole("button", { name: "Добавить" })
page.getByRole("heading", { name: "Мои задачи" })
page.getByLabel("Что нужно сделать")        // по тексту label
page.getByText("Здесь пусто.")              // по видимому тексту

// ⚠ Только если нет роли/label
page.locator(".task-item", { hasText: "Купить хлеб" })
page.locator("form.task-item")              // для формы редактирования
page.locator("input[type='date']")
```

Не используй `page.locator("#some-id")` и `data-testid` без необходимости — их нет в проекте.

---

## Типовые сценарии

### Создать задачу

```ts
await page.getByLabel("Что нужно сделать").fill("Купить хлеб");
await page.getByLabel("Описание (необязательно)").fill("в булочной");
await page.getByLabel("Срок").fill(isoInDays(3));
await page.getByRole("button", { name: "Добавить" }).click();

const item = page.locator(".task-item", { hasText: "Купить хлеб" });
await expect(item).toBeVisible();
```

### Отметить выполненной

```ts
const item = page.locator(".task-item", { hasText: "Задача" });
await item.locator(".task-checkbox").click();           // НЕ .check()!
await expect(item).toHaveClass(/done/);                // ждём re-render
```

### Редактировать задачу

```ts
const item = page.locator(".task-item").filter({ hasText: "Старое" });
await item.getByRole("button", { name: "Редактировать" }).click();

// После открытия формы — искать по CSS-классу, не по тексту задачи
const editForm = page.locator("form.task-item");
await editForm.locator("input").first().fill("Новое название");
await editForm.getByRole("button", { name: "Сохранить" }).click();

await expect(page.getByText("Новое название")).toBeVisible();
await expect(page.getByText("Старое")).toHaveCount(0);
```

### Удалить задачу

```ts
page.on("dialog", (dialog) => dialog.accept()); // подтверждение браузера

const item = page.locator(".task-item", { hasText: "Удалить меня" });
await item.getByRole("button", { name: "Удалить" }).click();
await expect(page.getByText("Удалить меня")).toHaveCount(0);
```

### Фильтры

```ts
await page.getByRole("button", { name: "Активные" }).click();
await page.getByRole("button", { name: "Выполненные" }).click();
await page.getByRole("button", { name: "Просроченные" }).click();
await page.getByRole("button", { name: "Все" }).click();
```

### Проверить статистику

```ts
const totalStat = page.locator(".stat", { hasText: "всего" });
await expect(totalStat.locator(".value")).toHaveText("1");
```

### Проверить тему

```ts
const html = page.locator("html");
await expect(html).toHaveAttribute("data-theme", /^(light|dark)$/);

await page.getByRole("button", { name: /включить (тёмную|светлую) тему/i }).click();
await expect(html).toHaveAttribute("data-theme", "dark"); // или "light"

await page.reload();
await expect(html).toHaveAttribute("data-theme", "dark"); // сохраняется
```

---

## Дебаг упавшего теста

```sh
npx playwright show-report           # HTML с trace и скриншотом
npx playwright test --debug -g "имя" # пошаговый инспектор
npx playwright test --headed         # видимый браузер
```

Trace Viewer (кнопка "View trace" в HTML-отчёте) показывает:
- DOM на каждом шаге
- Сетевые запросы
- Console логи
- Подсвеченный элемент
