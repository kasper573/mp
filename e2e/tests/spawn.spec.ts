import { join } from "node:path";

import { test } from "@playwright/test";

import { register } from "../helpers/account";
import { loadReference, looksLike } from "../helpers/image";

test("a new player loads into the game at the spawn location", async ({ page }) => {
  await register(page);
  await looksLike(page, loadReference(join(__dirname, "island.png")));
});
