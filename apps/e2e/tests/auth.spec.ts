import { expect, test } from "@playwright/test";
import { registerAndSignIn } from "../actions/register-and-sign-in";

test("can register, sign in, then sign out", async ({ page }) => {
  const { username } = await registerAndSignIn(page);

  const userMenuButton = page.getByRole("button", {
    name: new RegExp(username, "i"),
  });
  await userMenuButton.click();

  // Use getByText because Kobalte's PopoverClose sets aria-label="Dismiss" on links
  await page.getByText(/sign out/i).click();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});
