import path from "path";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { registerAndSignIn } from "../actions/register-and-sign-in";
import { getImageResemblance } from "../utils/image-resemblance";

const snapshotsDir = path.join(__dirname, "../snapshots");

test("can see game canvas after signing in", async ({ page }) => {
  await signInAndObserveGameCanvas(page);
});

test("can see game that resembles known image snapshot after signing in", async ({
  page,
}) => {
  const canvas = await signInAndObserveGameCanvas(page);
  const screenshot = await canvas.screenshot();
  const referenceImage = path.join(snapshotsDir, "game-after-signin.png");
  const resemblance = await getImageResemblance(referenceImage, screenshot);

  expect(
    resemblance,
    `Image resemblance score ${resemblance.toFixed(3)} is below threshold. ` +
      `The game canvas does not resemble the expected snapshot.`,
  ).toBeGreaterThan(0.7);
});

async function signInAndObserveGameCanvas(page: Page) {
  await registerAndSignIn(page);

  await page
    .getByRole("navigation")
    .getByRole("link", { name: /play/i })
    .click();

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 10000 });
  return canvas;
}
