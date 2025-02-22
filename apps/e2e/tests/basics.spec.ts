import { expect, test } from "npm:@playwright/test";

test("can load website", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/MP/);
  const text = page.getByText(/Welcome/i);
  await expect(text).toBeVisible();
});
