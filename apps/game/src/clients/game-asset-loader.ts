import type { AreaId } from "@mp/db/types";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createContext } from "preact";
import type { ActorSpritesheetLookup } from "../actor/actor-spritesheet-lookup";
import type { AreaResource } from "../area/area-resource";

export interface GameAssets {
  areaSpritesheets: TiledSpritesheetRecord;
  actorSpritesheets: ActorSpritesheetLookup;
  area: AreaResource;
}

export type GameAssetLoader = (areaId: AreaId) => GameAssets;

export const GameAssetLoaderContext = createContext(
  new Proxy({} as GameAssetLoader, {
    get() {
      throw new Error("GameAssetLoaderContext has not been provided");
    },
  }),
);
