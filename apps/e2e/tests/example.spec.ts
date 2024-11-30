import { test, expect } from "@playwright/test";

test("can load website", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/MP/);
  const text = page.getByText(/I am going to fail the test/);
  await expect(text).toBeVisible();
});
