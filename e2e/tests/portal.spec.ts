import { expect, test } from "@playwright/test";

import { provisionAccount, signIn } from "../helpers/account";
import { playAs } from "../helpers/character";
import { captureScene, holding, MAP_MATCH, probe, waitFor, waitForWorld } from "../helpers/game";
import { loadReference, resemblance } from "../helpers/image";
import { conversationOver, onStage, pick, readToChoices, talkTo } from "../helpers/talk";
import { travel } from "./travel";

test("the forest road holds you without a pass and crosses with one", async ({ page }) => {
  await playAs(page, "forest_bound");
  await signIn(page, await provisionAccount(page));
  const island = loadReference("island.png");
  const forest = loadReference("forest.png");
  await waitForWorld(page, island);
  const road = (await probe(page)).portals.find((portal) => portal.name === "forest-road");
  expect(road, "the island has a forest road").toBeDefined();

  await travel(page, road!.at);
  await waitFor(page, ({ history }) => history.records.some((record) => record.by === "Ilsa" && record.text.startsWith("Halt!")), "Ilsa never called out as you came near");
  await page.waitForTimeout(2000);
  const standing = await probe(page);
  expect(standing.area).toBe("island");
  expect(standing.stage).toBeNull();

  await talkTo(page, "ilsa", travel);
  await readToChoices(page, 300);
  await pick(page, "Would a fish change your mind?");
  await onStage(page, "fish");
  await readToChoices(page, 300);
  await pick(page, "Enjoy it.");
  await conversationOver(page);
  await waitFor(page, (snapshot) => holding(snapshot, "road_pass") === 1, "Ilsa never handed over the pass");

  // A warp takes whoever steps into it, so step off and back on until the forest renders. Repeats just
  // re-issue the (deterministic) crossing; the long timeout is only room for a slow renderer.
  const beside: [number, number] = [road!.at[0], road!.at[1] + 2];
  await expect
    .poll(
      async () => {
        const scene = await captureScene(page);
        if (resemblance(scene, forest) >= MAP_MATCH) {
          return true;
        }
        if ((await probe(page)).area === "island") {
          await travel(page, beside);
          await travel(page, road!.at);
        }
        return false;
      },
      { message: "with a pass, clicking the warp should cross into the forest", timeout: 120_000, intervals: [1000] },
    )
    .toBe(true);
});
