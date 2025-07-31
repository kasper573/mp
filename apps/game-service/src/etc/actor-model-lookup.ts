import type { ActorModelId } from "@mp/db/types";
import type { ActorModel, ActorModelLookup } from "@mp/game-shared";
import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";

export function createActorModelLookup(
  modelIds: ActorModelId[],
): ActorModelLookup {
  return new Map(
    modelIds.map((modelId) => {
      const model: ActorModel = {
        id: modelId,
        // TODO should be read from some meta data on file
        // These values are based on the adventurer model
        hitBox: new Rect(-0.5, -1.5, 1, 2) as Rect<Tile>,
      };
      return [modelId, model] as const;
    }),
  );
}
