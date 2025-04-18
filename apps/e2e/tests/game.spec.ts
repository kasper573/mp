import { expect, test } from "@playwright/test";
import { registerAndSignIn } from "../actions/register-and-sign-in";

test("can see game canvas after signing in", async ({ page }) => {
  await registerAndSignIn(page);

  // Tanstack router seems to have a bug where the lazy loading of routes get stuck in an infinite suspense state
  // if you immediately navigate to some other route after the page has loaded.
  // This can be reproduced by just clicking play really really fast after loading the page manually.
  // There's no easy fix outside of fixing the issue in the router itself,
  // so as a workaround we just wait for the network to be idle.
  // We can pretend that this represents a patient user that is waiting for the page to load, so it's not terrible.
  // TODO remove this workaround if the router issue ever becomes fixed.
  await page.waitForLoadState("networkidle");

  await page.getByRole("link", { name: /play/i }).click();

  await expect(page.locator("canvas")).toBeVisible();
});
