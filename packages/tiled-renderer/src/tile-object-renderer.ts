import { Container } from "@mp/graphics";
import { upsertMap } from "@mp/std";
import type {
  GlobalTileId,
  TileTransform,
  TiledObject,
} from "@mp/tiled-loader";
import { renderStaticTiles } from "./tile-renderer";
import type { TiledTextureLookup } from "./spritesheet";

export function createObjectRenderer(
  objects: TiledObject[],
  textureLookup: TiledTextureLookup,
): Container {
  // We only render objects that reference tiles via gid
  const renderGroups = new Map<GlobalTileId, TileTransform[]>();
  for (const obj of objects) {
    if (obj.gid !== undefined) {
      upsertMap(renderGroups, obj.gid, tiledObjectTransform(obj));
    }
  }

  const container = new Container({ isRenderGroup: true });
  for (const mesh of renderStaticTiles(renderGroups, textureLookup)) {
    container.addChild(mesh);
  }

  return container;
}

export function tiledObjectTransform(obj: TiledObject): TileTransform {
  return {
    width: obj.width,
    height: obj.height,
    x: obj.x,
    y: obj.y,
    flags: obj.flags,
    rotation: (obj.rotation / 180) * Math.PI, // Convert degrees to radians
    originX: 0,
    originY: 1, // Objects are anchored at the bottom left corner
  };
}
