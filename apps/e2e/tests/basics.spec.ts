import { test, expect } from "@playwright/test";

test("can load website", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/MP/);
  const text = page.getByText(/Play the game/i);
  await expect(text).toBeVisible();
});
