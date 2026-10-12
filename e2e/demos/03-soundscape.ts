import { test, type Page } from "@playwright/test";

import { caption, chapter, soundscapeMixer } from "../helpers/demo";
import {
  canvasSize,
  clickable,
  closestTile,
  distance,
  leaveConversation,
  occupied,
  probe,
  walkTo,
  warps,
  type SoundZone,
  type Tile,
} from "../helpers/game";

test(
  "Soundscape",
  chapter({
    summary: "Music and ambience laid over the map, mixed by where you stand",
    play: async (page) => {
      const hideMixer = await soundscapeMixer(page);
      const { soundscape, me } = await probe(page);
      const zone = (track: string) =>
        soundscape.zones.find((zone) => zone.tracks.some((played) => played.src.endsWith(track)))!;
      const town = zone("harbour.flac");
      const grove = zone("lagoon.flac");
      const jetty = zone("timbers.flac");
      const home = me!.at;

      await caption(page, "Soundscape zones lay music and ambience over the map, each track on a numbered channel, fading out past their edges");
      await page.waitForTimeout(6000);

      await caption(page, "Where two zones overlap they mix: both themes share channel 1, and the surf both play pools");
      await approach(page, [town.bounds.origin[0] + 1, home[1]]);
      await page.waitForTimeout(7000);

      await caption(page, "In the palm grove the lagoon theme has channel 1 to itself, and the jungle chorus joins on channel 3");
      await approach(page, center(grove));
      await page.waitForTimeout(7000);

      await caption(page, "Back in town, the harbour theme resumes where it would be had it never stopped");
      await approach(page, home);
      await page.waitForTimeout(6000);

      await caption(page, "The jetty emits further than most: its timbers and lapping water carry well past its edges");
      await approach(page, [jetty.bounds.origin[0] - jetty.reach / 2, center(jetty)[1]]);
      await page.waitForTimeout(6000);

      await caption(page, "On the jetty nothing claims channel 1, so the music fades out");
      await approach(page, center(jetty));
      await page.waitForTimeout(7000);

      await caption(page, "Out beyond every zone's reach, each channel fades to silence");
      await approach(page, [jetty.bounds.origin[0] + jetty.bounds.size[0] + jetty.reach + 1, center(jetty)[1]]);
      await page.waitForTimeout(7000);

      await caption(page, "And walking back, the harbour fades in again");
      await approach(page, home);
      await page.waitForTimeout(6000);
      await hideMixer();
    },
  }),
);

function center({ bounds: { origin, size } }: SoundZone): Tile {
  return [origin[0] + size[0] / 2, origin[1] + size[1] / 2];
}

async function approach(page: Page, spot: Tile): Promise<void> {
  for (;;) {
    const snapshot = await probe(page);
    if (snapshot.stage) {
      await leaveConversation(page);
      continue;
    }
    const at = snapshot.me!.at;
    const size = await canvasSize(page);
    const step = closestTile(
      snapshot.walkable.filter(
        (tile) => !occupied(snapshot, tile) && !warps(snapshot, tile) && clickable(snapshot, tile, size),
      ),
      spot,
    );
    if (!step || distance(step, spot) >= distance(at, spot) - 0.5) return;
    const reached = await walkTo(page, step);
    if (distance(reached, at) < 0.5) return;
  }
}
