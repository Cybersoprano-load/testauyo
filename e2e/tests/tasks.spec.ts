import { expect, test } from "@playwright/test";

import { makeTestUser, registerViaUi } from "../support/user";

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("tasks", () => {
  test.beforeEach(async ({ page }) => {
    await registerViaUi(page, makeTestUser());
  });

  test("создание задачи → появляется в списке, счётчики растут", async ({ page }) => {
    await expect(page.getByText("Здесь пусто.")).toBeVisible();

    await page.getByLabel("Что нужно сделать").fill("Купить хлеб");
    await page.getByLabel("Описание (необязательно)").fill("в булочной у дома");
    await page.getByLabel("Срок").fill(isoInDays(3));
    await page.getByRole("button", { name: "Добавить" }).click();

    const item = page.locator(".task-item", { hasText: "Купить хлеб" });
    await expect(item).toBeVisible();
    await expect(item.getByText("в булочной у дома")).toBeVisible();

    const totalStat = page.locator(".stat", { hasText: "всего" });
    await expect(totalStat.locator(".value")).toHaveText("1");
  });

  test("отметить выполненной → попадает в фильтр 'Выполненные'", async ({ page }) => {
    await page.getByLabel("Что нужно сделать").fill("Помыть посуду");
    await page.getByLabel("Срок").fill(isoInDays(1));
    await page.getByRole("button", { name: "Добавить" }).click();

    const item = page.locator(".task-item", { hasText: "Помыть посуду" });
    await item.locator(".task-checkbox").click();
    await expect(item).toHaveClass(/done/);

    await page.getByRole("button", { name: "Активные" }).click();
    await expect(page.getByText("Помыть посуду")).toHaveCount(0);

    await page.getByRole("button", { name: "Выполненные" }).click();
    await expect(page.getByText("Помыть посуду")).toBeVisible();
  });

  test("просроченная задача попадает в фильтр 'Просроченные'", async ({ page }) => {
    await page.getByLabel("Что нужно сделать").fill("Сдать отчёт");
    await page.getByLabel("Срок").fill(isoInDays(-2));
    await page.getByRole("button", { name: "Добавить" }).click();

    await page.getByRole("button", { name: "Просроченные" }).click();
    const overdue = page.locator(".task-item", { hasText: "Сдать отчёт" });
    await expect(overdue).toBeVisible();
    await expect(overdue).toHaveClass(/overdue/);
  });

  test("редактирование задачи", async ({ page }) => {
    await page.getByLabel("Что нужно сделать").fill("Старое название");
    await page.getByLabel("Срок").fill(isoInDays(1));
    await page.getByRole("button", { name: "Добавить" }).click();

    const item = page.locator(".task-item").filter({ hasText: "Старое название" });
    await item.getByRole("button", { name: "Редактировать" }).click();

    const editForm = page.locator("form.task-item");
    await editForm.locator("input").first().fill("Новое название");
    await editForm.getByRole("button", { name: "Сохранить" }).click();

    await expect(page.getByText("Новое название")).toBeVisible();
    await expect(page.getByText("Старое название")).toHaveCount(0);
  });

  test("сортировка по сроку: переключатель меняет порядок", async ({ page }) => {
    for (const [title, due] of [
      ["Бета", 5],
      ["Альфа", 1],
      ["Гамма", 10],
    ] as const) {
      await page.getByLabel("Что нужно сделать").fill(title);
      await page.getByLabel("Срок").fill(isoInDays(due));
      await page.getByRole("button", { name: "Добавить" }).click();
      await expect(page.locator(".task-item", { hasText: title })).toBeVisible();
    }

    const titles = page.locator(".task-item .task-title");
    await expect(titles).toHaveText(["Альфа", "Бета", "Гамма"]);

    await page.getByLabel("Изменить направление сортировки").click();
    await expect(titles).toHaveText(["Гамма", "Бета", "Альфа"]);
  });

  test("статистика отражает каскад: всего/активные/просрочено/выполнено", async ({ page }) => {
    const addTask = async (title: string, due: number) => {
      await page.getByLabel("Что нужно сделать").fill(title);
      await page.getByLabel("Срок").fill(isoInDays(due));
      await page.getByRole("button", { name: "Добавить" }).click();
      await expect(page.locator(".task-item", { hasText: title })).toBeVisible();
    };

    await addTask("Активная", 5);
    await addTask("Просроченная", -3);
    await addTask("Выполненная", 2);

    await page
      .locator(".task-item", { hasText: "Выполненная" })
      .locator(".task-checkbox")
      .click();
    await expect(page.locator(".task-item", { hasText: "Выполненная" })).toHaveClass(/done/);

    const stat = (name: string) => page.locator(".stat", { hasText: name }).locator(".value");
    await expect(stat("всего")).toHaveText("3");
    await expect(stat("активные")).toHaveText("2");
    await expect(stat("просрочено")).toHaveText("1");
    await expect(stat("выполнено")).toHaveText("1");
  });

  test("удаление задачи", async ({ page }) => {
    await page.getByLabel("Что нужно сделать").fill("Удалить меня");
    await page.getByLabel("Срок").fill(isoInDays(1));
    await page.getByRole("button", { name: "Добавить" }).click();

    page.on("dialog", (dialog) => dialog.accept());

    const item = page.locator(".task-item", { hasText: "Удалить меня" });
    await item.getByRole("button", { name: "Удалить" }).click();

    await expect(page.getByText("Удалить меня")).toHaveCount(0);
  });
});
