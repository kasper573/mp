import type { AreaId } from "@mp/db/types";
import type { ActorSpritesheetLookup, AreaResource } from "@mp/game-shared";
import type { TiledSpritesheetRecord } from "@mp/tiled-renderer";
import { createContext } from "preact";

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
