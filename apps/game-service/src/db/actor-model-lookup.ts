import type {
  ActorModel,
  ActorModelLookup,
  ActorSpritesheetUrls,
} from "@mp/game-shared";
import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";

export function createActorModelLookup(
  spritesheetUrls: ActorSpritesheetUrls,
): ActorModelLookup {
  return new Map(
    spritesheetUrls.entries().map(([modelId, spritesheets]) => {
      const model: ActorModel = {
        id: modelId,
        spritesheets,
        // TODO should be read from some meta data on file
        // These values are based on the adventurer model
        hitBox: new Rect(-0.5, -1.5, 1, 2) as Rect<Tile>,
      };
      return [modelId, model] as const;
    }),
  );
}
