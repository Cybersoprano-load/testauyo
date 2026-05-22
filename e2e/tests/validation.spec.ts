import { expect, test } from "@playwright/test";

import { makeTestUser, registerViaUi } from "../support/user";

test.describe("validation", () => {
  test("регистрация на занятый email показывает ошибку", async ({ page }) => {
    const user = makeTestUser();
    await registerViaUi(page, user);
    await page.getByRole("button", { name: "Выйти" }).click();
    await page.waitForURL("**/login");

    await page.goto("/register");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Пароль (от 8 символов)").fill(user.password);
    await page.getByLabel("Повторите пароль").fill(user.password);
    await page.getByRole("button", { name: /создать аккаунт/i }).click();

    await expect(page.getByText(/already registered/i)).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("сабмит с несовпадающими паролями показывает ошибку", async ({ page }) => {
    const user = makeTestUser();
    await page.goto("/register");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Пароль (от 8 символов)").fill(user.password);
    await page.getByLabel("Повторите пароль").fill("DifferentPass1");
    await page.getByRole("button", { name: /создать аккаунт/i }).click();

    await expect(page.getByText(/пароли не совпадают/i)).toBeVisible();
  });

  test("создание задачи только из пробелов показывает ошибку", async ({ page }) => {
    await registerViaUi(page, makeTestUser());

    await page.getByLabel("Что нужно сделать").fill("    ");
    await page.getByRole("button", { name: "Добавить" }).click();

    await expect(page.getByText(/введите название задачи/i)).toBeVisible();
    await expect(page.getByText("Здесь пусто.")).toBeVisible();
  });
});
