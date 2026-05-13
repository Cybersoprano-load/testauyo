import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

export interface TestUser {
  email: string;
  password: string;
}

export function makeTestUser(): TestUser {
  const id = randomUUID().replace(/-/g, "").slice(0, 16);
  return {
    email: `e2e-${id}@example.com`,
    password: "Pass1234!",
  };
}

export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Пароль (от 8 символов)").fill(user.password);
  await page.getByLabel("Повторите пароль").fill(user.password);
  await page.getByRole("button", { name: /создать аккаунт/i }).click();
  await page.waitForURL("/");
}

export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Пароль").fill(user.password);
  await page.getByRole("button", { name: /^войти$/i }).click();
  await page.waitForURL("/");
}
