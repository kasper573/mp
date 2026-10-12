import { expect, test } from "@playwright/test";

import { provisionAccount, signIn } from "../helpers/account";
import { playAs, residentSpot } from "../helpers/character";
import { caption, chapter } from "../helpers/demo";
import { deployChanges, type Deploy } from "../helpers/deploy";
import { arrivedIn, probe, waitFor, waitForWorld, walkTo } from "../helpers/game";
import { loadReference } from "../helpers/image";

let deploy: Deploy | undefined;

test(
  "Deploy",
  chapter({
    summary: "New content goes live while you play: a restart, a short download, and everyone rejoins",
    setup: async (page) => {
      await playAs(page, "talker", residentSpot("bloomvale", "farmer_girl"));
      await signIn(page, await provisionAccount(page));
      await waitFor(page, (snapshot) => arrivedIn(snapshot, "bloomvale") && snapshot.me, "never arrived in Bloomvale", 60_000);
      await page.waitForTimeout(1500);
    },
    play: async (page) => {
      await caption(page, "An evening in Bloomvale, on the content the server started with");
      const { me } = await probe(page);
      await walkTo(page, [me!.at[0] + 3, me!.at[1]]);
      await page.waitForTimeout(1500);
      await caption(page, "Meanwhile the game's folder changes and the server restarts on it: a content deploy");
      deploy = deployChanges({
        "game.json": (game) => (game.name = "Rift, second edition"),
        "tables/npc/mara.json": (npc) => (npc.name = "Mara the Harbourmaster"),
        "tables/npc/tobb.json": (npc) => (npc.name = "Tobb, town crier"),
        "tables/npc/grisha.json": (npc) => (npc.name = "Grisha of the quay"),
      });
      await expect(page.getByRole("status")).toContainText("Reconnecting", { timeout: 60_000 });
      await caption(page, "The world freezes under a veil while the client reconnects, with backoff so a crowd doesn't dogpile the server", {
        at: "top",
      });
      await expect(page.getByRole("status")).toContainText("Downloaded", { timeout: 60_000 });
      await caption(page, `The new manifest differs, so only the ${deploy.filesChanged} changed rows download; every other file is still on the device`, {
        at: "top",
      });
      await waitForWorld(page, loadReference("island.png"));
      await caption(page, "Characters live in the server's memory, so everyone rejoins as a new character at the spawn, on the new content");
      await page.waitForTimeout(4000);
    },
  }),
);

test.afterEach(() => {
  deploy?.undo();
  deploy = undefined;
});
