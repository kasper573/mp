import { expect, test } from "@playwright/test";
import { registerAndSignIn } from "../actions/register-and-sign-in";

test("can register, sign in, then sign out", async ({ page }) => {
  await registerAndSignIn(page);

  await page.getByRole("link", { name: /sign out/i }).click();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});
