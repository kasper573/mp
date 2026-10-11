import { test } from "@playwright/test";

import { register } from "../helpers/account";
import { caption, chapter } from "../helpers/demo";
import { waitForWorld } from "../helpers/game";
import { loadReference } from "../helpers/image";

test(
  "Sign in",
  chapter({
    summary: "From the website to the world in one sign-up",
    setup: async (page) => {
      await page.goto("/");
    },
    play: async (page) => {
      await caption(page, "Rift is an online RPG that runs right in the browser");
      await page.waitForTimeout(2000);
      await page.getByRole("link", { name: "Play" }).click();
      await caption(page, "New players register an account…");
      await page.waitForTimeout(1500);
      await register(page, { typingDelayMs: 35 });
      await caption(page, "…the game's content downloads once and stays on the device…");
      await waitForWorld(page, loadReference("island.png"));
      await caption(page, "…and they land straight in the world");
      await page.waitForTimeout(3000);
    },
  }),
);
