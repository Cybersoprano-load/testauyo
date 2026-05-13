import { expect, test } from "@playwright/test";

import { loginViaUi, makeTestUser, registerViaUi } from "../support/user";

test.describe("auth", () => {
  test("регистрация → редирект на список задач", async ({ page }) => {
    const user = makeTestUser();
    await registerViaUi(page, user);

    await expect(page.getByRole("heading", { name: "Мои задачи" })).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("выход → редирект на /login", async ({ page }) => {
    const user = makeTestUser();
    await registerViaUi(page, user);

    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL("**/login");
    await expect(page.getByRole("button", { name: /^войти$/i })).toBeVisible();
  });

  test("логин повторно тем же пользователем", async ({ page }) => {
    const user = makeTestUser();
    await registerViaUi(page, user);
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL("**/login");

    await loginViaUi(page, user);
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("неверный пароль → ошибка", async ({ page }) => {
    const user = makeTestUser();
    await registerViaUi(page, user);
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL("**/login");

    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Пароль").fill("WrongPass1");
    await page.getByRole("button", { name: /^войти$/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test("неавторизованный заход на / → редирект на /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await page.waitForURL("**/login");
  });
});
