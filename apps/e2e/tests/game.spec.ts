import { expect, test } from "@playwright/test";
import { registerAndSignIn } from "../actions/register-and-sign-in";

test("can see game canvas after signing in", async ({ page }) => {
  await registerAndSignIn(page);

  await page.getByRole("link", { name: /play/i }).click();

  await expect(page.locator("canvas")).toBeVisible();
});
