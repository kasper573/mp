// oxlint-disable no-await-in-loop
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { registerAndSignIn } from "../actions/register-and-sign-in";
import { analyzeAreaPalette, detectImageShift } from "../utils/image-analysis";

// World/area data taken from the published map files in
// docker/file-server/public/areas — design data the player can see, not
// internal state.
const FOREST = {
  mapSize: { x: 720, y: 496 },
  playerStart: { x: 56.08, y: 298.077 },
  // The shell portal that warps to the island, centered on its tile.
  portalTile: { x: 3, y: 21 },
};

const ISLAND = {
  mapSize: { x: 1600, y: 1600 },
  // Tile that the forest portal warps incoming players to (forest map's
  // `goto` value is `island,39,28`). Used to compute click positions for
  // tests that arrive on the island via the portal rather than spawning.
  playerStart: { x: 632, y: 456 },
  // The closest shell portal back to the forest, centered on its tile.
  portalTile: { x: 39, y: 26 },
};

test("character is killed by aggro enemies when standing still after entering the game", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await enterGame(page);
  // The respawn dialog renders its children inside a `<dialog>` element that
  // is hidden via the user-agent `display: none` rule when the `open`
  // attribute is absent, but the heading text is still in the accessibility
  // tree, which causes `getByText(...).toBeVisible()` to incorrectly match.
  // Asserting on the actual `<dialog open>` attribute is the only signal
  // that distinguishes "dead, dialog visible" from "alive, dialog rendered
  // but hidden".
  await expect(
    page.locator("dialog[open]").getByText(/you are dead/i),
  ).toBeVisible({ timeout: 60_000 });
});

test("clicking on the ground makes the character walk toward the click", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const canvas = await enterGame(page);
  // Give the initial frame a moment to fully render before snapshotting.
  await page.waitForTimeout(1000);
  const before = await canvas.screenshot();

  // Click toward the south-east. Walking past the camera-clamp boundary
  // forces the camera to track the character, which lets us verify the
  // click triggered movement using template matching.
  const target = await tileToCanvasPosition(canvas, FOREST, { x: 18, y: 24 });
  await page.mouse.click(target.x, target.y, { delay: 100 });

  await expect
    .poll(
      async () => {
        const shift = await detectImageShift(
          before,
          await canvas.screenshot(),
          { maxShiftPixels: 600 },
        );
        // Click was south-east; if the click triggers walking the camera
        // will follow south-east, and aligning `before` with the later
        // screenshot needs a positive dx/dy. We require both axes to have
        // moved to rule out random animation noise on a single axis.
        return shift.dx >= 30 && shift.dy >= 15;
      },
      { timeout: 12_000, intervals: [500, 1000] },
    )
    .toBe(true);
});

test("camera follows the character when walking a significant distance", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const canvas = await enterGame(page);
  await page.waitForTimeout(1000);
  const before = await canvas.screenshot();

  // Click toward the far edge of the visible canvas. Re-issue the click
  // periodically (always at the same screen position) so aggro NPCs
  // harassing the character do not silently pin them inside the clamped
  // region for the entire test. Because the click is at a fixed screen
  // position, it stays on-canvas even as the camera scrolls.
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const clickPosition = {
    x: box.x + box.width * 0.95,
    y: box.y + box.height * 0.95,
  };

  // Sample screenshots periodically while the character is walking and
  // look for ANY two of them that align via a non-trivial translation.
  // Camera panning produces a coherent global shift between earlier and
  // later frames; sprite movement alone (with the camera clamped at
  // spawn) cannot, because the background tiles have not moved.
  const samples: Buffer[] = [before];
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(clickPosition.x, clickPosition.y, { delay: 50 });
    await page.waitForTimeout(1500);
    samples.push(await canvas.screenshot());
  }

  let bestShift = 0;
  let bestDescription = "";
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const shift = await detectImageShift(samples[i], samples[j], {
        maxShiftPixels: 600,
      });
      const magnitude = Math.abs(shift.dx) + Math.abs(shift.dy);
      if (magnitude > bestShift) {
        bestShift = magnitude;
        bestDescription = `samples[${i}]→samples[${j}]: dx=${shift.dx} dy=${shift.dy} confidence=${shift.confidence.toFixed(2)}`;
      }
    }
  }

  expect(
    bestShift,
    `expected the camera to pan during walking but the largest detected ` +
      `shift across all sample pairs was ${bestShift}px (${bestDescription})`,
  ).toBeGreaterThan(80);
});

test("walking into the forest shell portal transports to the island map", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const canvas = await enterGame(page);
  await page.waitForTimeout(500);

  // Sanity check: we are in the forest before clicking the portal. If this
  // fails the test setup is wrong (e.g. the start area changed), so do not
  // proceed with the portal click.
  await waitForArea(page, "forest", 5_000);

  const portal = await tileToCanvasPosition(canvas, FOREST, FOREST.portalTile);
  await page.mouse.click(portal.x, portal.y, { delay: 100 });

  await waitForArea(page, "island", 12_000);
});

test("walking into the island shell portal transports back to the forest map", async ({
  page,
}) => {
  test.setTimeout(75_000);
  const canvas = await enterGame(page);
  await page.waitForTimeout(500);

  // Setup: take the forest portal to reach the island.
  const forestPortal = await tileToCanvasPosition(
    canvas,
    FOREST,
    FOREST.portalTile,
  );
  await page.mouse.click(forestPortal.x, forestPortal.y, { delay: 100 });
  await waitForArea(page, "island", 12_000);

  // The canvas is recreated when the area changes, so resolve a fresh
  // reference before computing a click target on it.
  const islandCanvas = page.locator("canvas");
  await expect(islandCanvas).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(500);

  // Subject under test: walk into the island's portal back to the forest.
  const islandPortal = await tileToCanvasPosition(
    islandCanvas,
    ISLAND,
    ISLAND.portalTile,
  );
  await page.mouse.click(islandPortal.x, islandPortal.y, { delay: 100 });

  await waitForArea(page, "forest", 12_000);
});

/**
 * Polls the canvas until its color palette is dominated by tiles from the
 * expected area. The forest map is heavy on grass green and dirt red; the
 * island map is heavy on beach sand and ocean blue. The two palettes are
 * disjoint enough that this is a reliable identification of "which area is
 * the camera currently looking at" without needing a brittle pixel-perfect
 * snapshot.
 */
async function waitForArea(
  page: Page,
  expectedArea: "forest" | "island",
  timeoutMs: number,
): Promise<void> {
  // Screenshot the page (rather than the canvas locator) because the
  // canvas element is unmounted while the new area's assets are loading,
  // and we still want to keep polling through that loading window.
  await expect
    .poll(
      async () => {
        const palette = await analyzeAreaPalette(await page.screenshot());
        const forestScore = palette.forestGreen + palette.forestRed;
        const islandScore = palette.beachSand + palette.beachWater;
        return expectedArea === "forest"
          ? forestScore - islandScore
          : islandScore - forestScore;
      },
      {
        timeout: timeoutMs,
        intervals: [500, 1000],
        message: `page should look like the ${expectedArea} map`,
      },
    )
    .toBeGreaterThan(0.1);
}

async function enterGame(page: Page): Promise<Locator> {
  await registerAndSignIn(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: /play/i })
    .click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  // The Inventory label only renders once the game state has connected and
  // the area has loaded — wait for it so we do not interact with the
  // loading screen rendered behind the canvas element.
  await expect(page.getByText("Inventory", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return canvas;
}

interface AreaInfo {
  mapSize: { x: number; y: number };
  playerStart: { x: number; y: number };
}

/**
 * Converts a tile coordinate in the given area to an absolute screen
 * position (in page coordinates) suitable for `page.mouse.click`. Assumes
 * the camera is centered on the area's spawn point — true immediately
 * after entering an area, before the character has moved.
 */
async function tileToCanvasPosition(
  canvas: Locator,
  area: AreaInfo,
  tile: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("canvas has no bounding box");
  }
  const TILE_SIZE = 16;
  const RENDERED_TILE_COUNT = 24;
  const zoom =
    Math.max(box.width, box.height) / TILE_SIZE / RENDERED_TILE_COUNT;
  const halfW = box.width / 2 / zoom;
  const halfH = box.height / 2 / zoom;
  const camX = clamp(area.playerStart.x, halfW, area.mapSize.x - halfW);
  const camY = clamp(area.playerStart.y, halfH, area.mapSize.y - halfH);
  const worldX = (tile.x + 0.5) * TILE_SIZE;
  const worldY = (tile.y + 0.5) * TILE_SIZE;
  return {
    x: box.x + (worldX - camX) * zoom + box.width / 2,
    y: box.y + (worldY - camY) * zoom + box.height / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
