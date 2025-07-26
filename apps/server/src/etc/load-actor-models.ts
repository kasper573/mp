import type {
  ActorModel,
  ActorModelLookup,
  ActorSpritesheetUrls,
} from "@mp/game/server";
import type { Tile } from "@mp/std";
import { Rect } from "@mp/math";

export function loadActorModels(
  allActorSpritesheets: ActorSpritesheetUrls,
): ActorModelLookup {
  return new Map(
    allActorSpritesheets.entries().map(([modelId, spritesheets]) => {
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
