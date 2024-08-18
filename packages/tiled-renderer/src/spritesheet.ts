import type { SpritesheetData, SpritesheetFrameData } from "@mp/pixi";
import { Spritesheet, Texture } from "@mp/pixi";
import type { GlobalTileId, TiledMap } from "@mp/tiled-loader";

export function createTiledSpritesheet(tiledMap: TiledMap): TiledSpritesheet {
  return new Spritesheet(Texture.from(""), { frames: {}, meta: {} } as never);
}

export type TiledSpritesheet = Spritesheet<TiledSpritesheetData>;

export type TiledSpritesheetData = Omit<SpritesheetData, "frames"> & {
  frames: Record<TiledSpritesheetFrameId, SpritesheetFrameData>;
};

export type TiledSpritesheetFrameId = string & {
  __brand: "TiledSpritesheetFrameId";
};

export function frameIdForGID(gid: GlobalTileId): TiledSpritesheetFrameId {
  return `${gid}` as TiledSpritesheetFrameId;
}
