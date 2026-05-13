import { expect, test } from "@playwright/test";

import { makeTestUser, registerViaUi } from "../support/user";

test.describe("theme", () => {
  test("переключатель меняет data-theme и сохраняется при reload", async ({ page }) => {
    await registerViaUi(page, makeTestUser());

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", /^(light|dark)$/);
    const initial = await html.getAttribute("data-theme");
    const opposite = initial === "light" ? "dark" : "light";

    await page
      .getByRole("button", { name: /включить (тёмную|светлую) тему/i })
      .click();
    await expect(html).toHaveAttribute("data-theme", opposite);

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", opposite);
  });
});
